import {
  LINK_ESTIMATE_SPEED_MS,
  LINK_SAMPLE_COUNT,
  LINK_SAMPLE_MAX_TICKS,
  TICK_SECONDS,
  TILE_SIZE_M,
} from '../constants';
import { OrderTarget } from '../vehicles/VehicleStore';
import type { World } from '../World';
import { tileDistance } from './payment';

/**
 * The connection table of section 7.4.
 *
 * Every pair of stations a vehicle actually runs between is a LINK, and every
 * link carries the mean of the last eight trips over it. From those links the
 * graph works out, for every station and every destination, how long cargo
 * standing here should expect to take to get there - including over transfers it
 * knows nothing about in advance.
 *
 * That single table is what turns "cargo is taken by whoever stops" into a
 * network: a parcel is only loaded onto a vehicle that carries it closer to
 * where it is going, and it is set down again at the station where its line
 * stops helping. Feeder chains fall out of it rather than being modelled.
 *
 * The spec words this as a table kept BY each station. One graph indexed by
 * station is the same table, stored once instead of n times, and it is the only
 * shape in which the transfer chains can be computed at all - a station cannot
 * work out on its own what lies two changes away (DECISIONS.md D-075).
 *
 * Links are measured state, not derived: they hold what actually happened on
 * this network. They are therefore saved and hashed. Which links are ACTIVE is
 * derived from the vehicles' orders and is recomputed instead.
 */

/**
 * Stride of the (from, to) key. A million stations is far past MAX_STATIONS, and
 * the product stays well inside the exactly representable integers.
 */
const LINK_KEY_STRIDE = 1 << 20;

/** Sentinel for "no route", kept out of the arithmetic as a real infinity. */
const UNREACHABLE = Infinity;

export interface CargoLink {
  readonly fromStationId: number;
  readonly toStationId: number;
  /**
   * The last completed trips over this leg, newest overwriting oldest once
   * there are eight of them. [ticks]
   */
  readonly samples: number[];
  /** Where the next sample goes once the ring is full. */
  cursor: number;
  /**
   * Mean of the samples, or the straight-line estimate while there are none.
   * [ticks]
   */
  meanTicks: number;
}

/** Serialised shape of one link. */
export interface CargoLinkSave {
  fromStationId: number;
  toStationId: number;
  samples: number[];
  cursor: number;
  meanTicks: number;
}

export class LinkGraph {
  /** Every link ever observed, in the order it was first seen. */
  readonly links: CargoLink[] = [];
  /** (from, to) key to index into `links`. A lookup only, never iterated. */
  private readonly index = new Map<number, number>();

  /** 1 while some vehicle's orders still contain the link. Derived. */
  private active = new Uint8Array(0);
  /** Scratch for one pass of {@link refreshLinks}; grows with `active`. */
  private seen = new Uint8Array(0);

  /** Bumped when the set of ACTIVE links changes; forces a rebuild. */
  private topology = 0;
  /** Bumped when a mean moves; folded in on the daily rebuild. */
  private means = 0;
  private builtTopology = -1;
  private builtMeans = -1;

  /** Stations the current table covers. */
  private nodes = 0;
  /** Expected time from `from` to `to`, row major. [ticks] */
  private costs = new Float64Array(0);

  // Incoming-edge lists, rebuilt with the table. The search runs backwards from
  // each destination, so it needs the edges pointing INTO a node.
  private inHead = new Int32Array(0);
  private inFrom = new Int32Array(0);
  private inCost = new Float64Array(0);
  /** Counting-sort cursors, one per node. */
  private inFill = new Int32Array(0);

  // Working space for one backwards search. Preallocated with the table.
  private dist = new Float64Array(0);
  private settled = new Uint8Array(0);
  private heapNode = new Int32Array(0);
  private heapCost = new Float64Array(0);
  private heapSize = 0;

  /** Expected travel time between two stations, or Infinity. [ticks] */
  expectedTicks(fromStationId: number, toStationId: number): number {
    if (fromStationId === toStationId) return 0;
    if (fromStationId < 0 || toStationId < 0) return UNREACHABLE;
    if (fromStationId >= this.nodes || toStationId >= this.nodes) return UNREACHABLE;
    return this.costs[fromStationId * this.nodes + toStationId]!;
  }

  /** Time of the direct leg between two stations, or Infinity. [ticks] */
  legTicks(fromStationId: number, toStationId: number): number {
    const link = this.linkAt(fromStationId, toStationId);
    if (link < 0 || this.active[link] !== 1) return UNREACHABLE;
    return this.links[link]!.meanTicks;
  }

  /** True while some vehicle is ordered to run this leg. */
  isActive(fromStationId: number, toStationId: number): boolean {
    const link = this.linkAt(fromStationId, toStationId);
    return link >= 0 && this.active[link] === 1;
  }

  private linkAt(fromStationId: number, toStationId: number): number {
    if (fromStationId < 0 || toStationId < 0) return -1;
    return this.index.get(fromStationId * LINK_KEY_STRIDE + toStationId) ?? -1;
  }

  /**
   * Record one completed trip.
   *
   * Trips over a leg no vehicle is ordered to run any more are ignored, as are
   * absurdly long ones - a vehicle that was stopped half way, or had its orders
   * rewritten, did not measure this leg, it merely took that long to reappear.
   */
  observe(fromStationId: number, toStationId: number, ticks: number): void {
    if (ticks <= 0 || ticks > LINK_SAMPLE_MAX_TICKS) return;
    const at = this.linkAt(fromStationId, toStationId);
    if (at < 0 || this.active[at] !== 1) return;

    const link = this.links[at]!;
    if (link.samples.length < LINK_SAMPLE_COUNT) link.samples.push(ticks);
    else {
      link.samples[link.cursor] = ticks;
      link.cursor = (link.cursor + 1) % LINK_SAMPLE_COUNT;
    }

    let total = 0;
    for (let i = 0; i < link.samples.length; i++) total += link.samples[i]!;
    link.meanTicks = total / link.samples.length;
    this.means++;
  }

  /**
   * Work out which legs the fleet currently runs, and seed any that are new.
   *
   * A vehicle's orders are a cycle: the last station leads back to the first.
   * Depot orders are stations no cargo can be left at, so they are stepped over
   * rather than breaking the chain - a train that visits its shed between two
   * stops still connects those two stops.
   */
  refreshLinks(world: World): void {
    this.reserve(this.links.length);
    this.seen.fill(0);
    let changed = false;

    const vehicles = world.vehicles;
    for (let id = 0; id < vehicles.count; id++) {
      if (vehicles.alive[id] !== 1) continue;
      const orders = vehicles.orders[id]!;

      let first = -1;
      let previous = -1;
      for (let i = 0; i < orders.length; i++) {
        const order = orders[i]!;
        if (order.target !== OrderTarget.Station) continue;
        if (world.stations[order.targetId] === undefined) continue;

        const station = order.targetId;
        if (first < 0) first = station;
        if (previous >= 0 && previous !== station) {
          changed = this.touch(world, previous, station) || changed;
        }
        previous = station;
      }
      // Close the cycle: the last stop leads back to the first.
      if (first >= 0 && previous >= 0 && previous !== first) {
        changed = this.touch(world, previous, first) || changed;
      }
    }

    for (let at = 0; at < this.links.length; at++) {
      const wanted = this.seen[at] === 1 ? 1 : 0;
      if (this.active[at] === wanted) continue;
      this.active[at] = wanted;
      changed = true;
    }
    if (changed) this.topology++;
  }

  /** Grow the per-link flag arrays so index `count - 1` is addressable. */
  private reserve(count: number): void {
    if (this.active.length >= count) return;
    const size = count + 64;
    const active = new Uint8Array(size);
    active.set(this.active);
    this.active = active;
    const seen = new Uint8Array(size);
    seen.set(this.seen);
    this.seen = seen;
  }

  /** Ensure the link exists and mark it wanted. Returns true when it is new. */
  private touch(world: World, from: number, to: number): boolean {
    const key = from * LINK_KEY_STRIDE + to;
    const existing = this.index.get(key);
    if (existing !== undefined) {
      this.seen[existing] = 1;
      return false;
    }

    const at = this.links.length;
    this.links.push({
      fromStationId: from,
      toStationId: to,
      samples: [],
      cursor: 0,
      meanTicks: estimateTicks(world, from, to),
    });
    this.index.set(key, at);

    this.reserve(at + 1);
    this.seen[at] = 1;
    this.active[at] = 1;
    return true;
  }

  /**
   * Bring the all-pairs table up to date if the SET of links moved.
   *
   * Called before anything reads the table. Measurements alone do not trigger
   * this - a rebuild on every arrival would be a search per vehicle per stop -
   * they are folded in once a day by {@link refreshDaily}.
   */
  ensureRouting(world: World): void {
    if (this.builtTopology === this.topology && this.nodes === world.stations.length) return;
    this.rebuild(world);
  }

  /** Once a game day: re-read the orders and fold in the new measurements. */
  refreshDaily(world: World): void {
    this.refreshLinks(world);
    if (
      this.builtTopology === this.topology &&
      this.builtMeans === this.means &&
      this.nodes === world.stations.length
    ) {
      return;
    }
    this.rebuild(world);
  }

  /**
   * Shortest expected time from every station to every other, over the active
   * links.
   *
   * One backwards search per destination: relaxing the links that point INTO a
   * settled node gives the cost from every origin to that one destination, which
   * is exactly the column of the table. Ties are broken on the node id so the
   * result cannot depend on heap order.
   */
  private rebuild(world: World): void {
    const nodes = world.stations.length;
    this.nodes = nodes;
    this.builtTopology = this.topology;
    this.builtMeans = this.means;

    if (this.costs.length < nodes * nodes) this.costs = new Float64Array(nodes * nodes);
    this.costs.fill(UNREACHABLE, 0, nodes * nodes);
    if (nodes === 0) return;

    if (this.dist.length < nodes) {
      this.dist = new Float64Array(nodes);
      this.settled = new Uint8Array(nodes);
      this.heapNode = new Int32Array(nodes * 4);
      this.heapCost = new Float64Array(nodes * 4);
      this.inHead = new Int32Array(nodes + 1);
    }
    if (this.inHead.length < nodes + 1) this.inHead = new Int32Array(nodes + 1);

    // Counting sort of the active links by their target, into an adjacency list
    // of incoming edges.
    this.inHead.fill(0, 0, nodes + 1);
    let edges = 0;
    for (let at = 0; at < this.links.length; at++) {
      if (this.active[at] !== 1) continue;
      const link = this.links[at]!;
      if (link.fromStationId >= nodes || link.toStationId >= nodes) continue;
      this.inHead[link.toStationId + 1] = this.inHead[link.toStationId + 1]! + 1;
      edges++;
    }
    for (let node = 0; node < nodes; node++) {
      this.inHead[node + 1] = this.inHead[node + 1]! + this.inHead[node]!;
    }
    if (this.inFrom.length < edges) {
      this.inFrom = new Int32Array(edges);
      this.inCost = new Float64Array(edges);
    }
    if (this.inFill.length < nodes) this.inFill = new Int32Array(nodes);
    const fill = this.inFill;
    fill.fill(0, 0, nodes);
    for (let at = 0; at < this.links.length; at++) {
      if (this.active[at] !== 1) continue;
      const link = this.links[at]!;
      if (link.fromStationId >= nodes || link.toStationId >= nodes) continue;
      const slot = this.inHead[link.toStationId]! + fill[link.toStationId]!;
      fill[link.toStationId] = fill[link.toStationId]! + 1;
      this.inFrom[slot] = link.fromStationId;
      this.inCost[slot] = link.meanTicks;
    }
    if (edges === 0) {
      for (let node = 0; node < nodes; node++) this.costs[node * nodes + node] = 0;
      return;
    }

    for (let target = 0; target < nodes; target++) {
      this.searchTo(target, nodes);
      for (let from = 0; from < nodes; from++) {
        this.costs[from * nodes + target] = this.dist[from]!;
      }
    }
  }

  /** Dijkstra backwards from one destination; leaves the result in `dist`. */
  private searchTo(target: number, nodes: number): void {
    this.dist.fill(UNREACHABLE, 0, nodes);
    this.settled.fill(0, 0, nodes);
    this.heapSize = 0;

    this.dist[target] = 0;
    this.push(target, 0);

    while (this.heapSize > 0) {
      const node = this.pop();
      if (this.settled[node] === 1) continue;
      this.settled[node] = 1;

      const cost = this.dist[node]!;
      const end = this.inHead[node + 1]!;
      for (let edge = this.inHead[node]!; edge < end; edge++) {
        const from = this.inFrom[edge]!;
        if (this.settled[from] === 1) continue;
        const candidate = cost + this.inCost[edge]!;
        if (candidate >= this.dist[from]!) continue;
        this.dist[from] = candidate;
        this.push(from, candidate);
      }
    }
  }

  private push(node: number, cost: number): void {
    if (this.heapSize >= this.heapNode.length) {
      const grown = new Int32Array(this.heapNode.length * 2 + 16);
      grown.set(this.heapNode);
      this.heapNode = grown;
      const grownCost = new Float64Array(grown.length);
      grownCost.set(this.heapCost);
      this.heapCost = grownCost;
    }

    let at = this.heapSize++;
    this.heapNode[at] = node;
    this.heapCost[at] = cost;
    while (at > 0) {
      const parent = (at - 1) >> 1;
      if (!this.less(at, parent)) break;
      this.swap(at, parent);
      at = parent;
    }
  }

  private pop(): number {
    const top = this.heapNode[0]!;
    this.heapSize--;
    if (this.heapSize > 0) {
      this.heapNode[0] = this.heapNode[this.heapSize]!;
      this.heapCost[0] = this.heapCost[this.heapSize]!;
      let at = 0;
      for (;;) {
        const left = at * 2 + 1;
        const right = left + 1;
        let best = at;
        if (left < this.heapSize && this.less(left, best)) best = left;
        if (right < this.heapSize && this.less(right, best)) best = right;
        if (best === at) break;
        this.swap(at, best);
        at = best;
      }
    }
    return top;
  }

  /** Total order: cost, then node id, so ties never depend on heap order. */
  private less(a: number, b: number): boolean {
    const costA = this.heapCost[a]!;
    const costB = this.heapCost[b]!;
    if (costA !== costB) return costA < costB;
    return this.heapNode[a]! < this.heapNode[b]!;
  }

  private swap(a: number, b: number): void {
    const node = this.heapNode[a]!;
    this.heapNode[a] = this.heapNode[b]!;
    this.heapNode[b] = node;
    const cost = this.heapCost[a]!;
    this.heapCost[a] = this.heapCost[b]!;
    this.heapCost[b] = cost;
  }

  // ------------------------------------------------------------ persistence

  toData(): CargoLinkSave[] {
    return this.links.map((link) => ({
      fromStationId: link.fromStationId,
      toStationId: link.toStationId,
      samples: [...link.samples],
      cursor: link.cursor,
      meanTicks: link.meanTicks,
    }));
  }

  /**
   * Restore measured links. Which of them are active, and the table built from
   * them, are derived and are worked out again on the first day that runs.
   */
  loadData(saved: readonly CargoLinkSave[]): void {
    this.links.length = 0;
    this.index.clear();
    for (const link of saved) {
      const key = link.fromStationId * LINK_KEY_STRIDE + link.toStationId;
      if (this.index.has(key)) continue;
      this.index.set(key, this.links.length);
      this.links.push({
        fromStationId: link.fromStationId,
        toStationId: link.toStationId,
        samples: [...link.samples],
        cursor: link.cursor,
        meanTicks: link.meanTicks,
      });
    }
    this.active = new Uint8Array(0);
    this.seen = new Uint8Array(0);
    this.reserve(this.links.length);
    this.topology++;
  }
}

/**
 * Time to credit a leg with before anybody has driven it. [ticks]
 *
 * Straight line over the nominal speed. It is wrong in both directions - a road
 * bends, a train is faster - and it does not need to be right: it only has to
 * put the leg on the map so that the first parcel produced has somewhere to go.
 * The first completed trip replaces it outright.
 */
function estimateTicks(world: World, fromStationId: number, toStationId: number): number {
  const from = world.stations[fromStationId];
  const to = world.stations[toStationId];
  if (from === undefined || to === undefined) return UNREACHABLE;

  const tiles = tileDistance(from.x, from.y, to.x, to.y);
  return (tiles * TILE_SIZE_M) / LINK_ESTIMATE_SPEED_MS / TICK_SECONDS;
}
