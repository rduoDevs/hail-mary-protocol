import { ShipState } from './types';

/**
 * Apply per-round deterioration to the ship.
 * repairPartsSpentLastRound is the count of repair actions taken last round.
 */
export function applyShipDeterioration(ship: ShipState, repairActionsLastRound: number): ShipState {
  const repairPartsSpent = repairActionsLastRound * 4; // each repair costs 4 parts
  const hullDamage = Math.max(0, 10 - repairPartsSpent / 2);

  return {
    ...ship,
    oxygen: Math.max(0, ship.oxygen - 8),
    power: Math.max(0, ship.power - 6),
    repair_parts: Math.max(0, ship.repair_parts - 2),
    hull_integrity: Math.max(0, ship.hull_integrity - hullDamage),
  };
}

export function clampShip(ship: ShipState): ShipState {
  return {
    ...ship,
    hull_integrity: Math.min(100, Math.max(0, ship.hull_integrity)),
    oxygen: Math.min(100, Math.max(0, ship.oxygen)),
    power: Math.min(100, Math.max(0, ship.power)),
    repair_parts: Math.min(50, Math.max(0, ship.repair_parts)),
  };
}
