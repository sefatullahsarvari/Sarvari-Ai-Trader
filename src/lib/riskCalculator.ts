import type { XMContractSpecs } from '../types/market.ts';

export const DEFAULT_XM_GOLD_SPECS: XMContractSpecs = {
  contractSize: 100,
  minVolume: 0.01,
  volumeStep: 0.01,
  tickSize: 0.01,
  tickValue: 1,
};

export interface RiskCalculationInput {
  accountBalance: number;
  riskPercent: number;
  entryPrice: number;
  stopLossPrice: number;
  takeProfit1Price?: number | null;
  takeProfit2Price?: number | null;
  specs: XMContractSpecs;
}

export interface RiskCalculationResult {
  valid: boolean;
  reason?: string;
  riskAmount: number | null;
  stopDistance: number | null;
  stopTicks: number | null;
  rawLots: number | null;
  recommendedLots: number | null;
  actualRiskAmount: number | null;
  actualRiskPercent: number | null;
  potentialProfitTp1: number | null;
  potentialProfitTp2: number | null;
  riskReward1: number | null;
  riskReward2: number | null;
}

export function calculateGoldRisk(input: RiskCalculationInput): RiskCalculationResult {
  const { accountBalance, riskPercent, entryPrice, stopLossPrice, takeProfit1Price, takeProfit2Price, specs } = input;

  const invalidResult = (reason: string): RiskCalculationResult => ({
    valid: false,
    reason,
    riskAmount: null,
    stopDistance: null,
    stopTicks: null,
    rawLots: null,
    recommendedLots: null,
    actualRiskAmount: null,
    actualRiskPercent: null,
    potentialProfitTp1: null,
    potentialProfitTp2: null,
    riskReward1: null,
    riskReward2: null,
  });

  if (!Number.isFinite(accountBalance) || accountBalance <= 0) {
    return invalidResult('Enter a valid positive account balance.');
  }
  if (!Number.isFinite(riskPercent) || riskPercent <= 0 || riskPercent > 100) {
    return invalidResult('Risk percentage must be greater than 0% and at most 100%.');
  }
  if (!Number.isFinite(entryPrice) || entryPrice <= 0) {
    return invalidResult('Enter a valid entry price.');
  }
  if (!Number.isFinite(stopLossPrice) || stopLossPrice <= 0) {
    return invalidResult('Enter a valid Stop Loss price.');
  }

  if (
    !Number.isFinite(specs.contractSize) ||
    specs.contractSize <= 0 ||
    !Number.isFinite(specs.minVolume) ||
    specs.minVolume <= 0 ||
    !Number.isFinite(specs.volumeStep) ||
    specs.volumeStep <= 0 ||
    !Number.isFinite(specs.tickSize) ||
    specs.tickSize <= 0 ||
    !Number.isFinite(specs.tickValue) ||
    specs.tickValue <= 0
  ) {
    return invalidResult('Lot size uncertain — all XM contract specification values must be positive numbers.');
  }

  const stopDistance = Math.abs(entryPrice - stopLossPrice);
  if (stopDistance < specs.tickSize) {
    return invalidResult('Stop Loss distance is smaller than one tick size.');
  }

  const stopTicks = stopDistance / specs.tickSize;
  const lossPerStandardLot = stopTicks * specs.tickValue;

  if (!Number.isFinite(lossPerStandardLot) || lossPerStandardLot <= 0) {
    return invalidResult('Lot size uncertain — unable to derive loss per standard lot.');
  }

  const riskAmount = accountBalance * (riskPercent / 100);
  const rawLots = riskAmount / lossPerStandardLot;

  // Floor to volumeStep so actual risk never exceeds target risk percentage
  const steps = Math.floor(rawLots / specs.volumeStep + 1e-9);
  const recommendedLots = Number((steps * specs.volumeStep).toFixed(4));

  if (recommendedLots < specs.minVolume) {
    return {
      ...invalidResult(
        `Calculated lot size (${rawLots.toFixed(4)}) is below broker minimum volume (${specs.minVolume}). Increase stop budget or reduce SL distance rather than over-leveraging.`,
      ),
      riskAmount: Number(riskAmount.toFixed(2)),
      stopDistance: Number(stopDistance.toFixed(4)),
      stopTicks: Math.round(stopTicks),
      rawLots: Number(rawLots.toFixed(4)),
    };
  }

  const actualRiskAmount = recommendedLots * lossPerStandardLot;
  const actualRiskPercent = (actualRiskAmount / accountBalance) * 100;

  let potentialProfitTp1: number | null = null;
  let riskReward1: number | null = null;
  if (takeProfit1Price && Number.isFinite(takeProfit1Price) && takeProfit1Price > 0) {
    const tp1Dist = Math.abs(takeProfit1Price - entryPrice);
    potentialProfitTp1 = Number(((tp1Dist / specs.tickSize) * specs.tickValue * recommendedLots).toFixed(2));
    riskReward1 = Number((tp1Dist / stopDistance).toFixed(2));
  }

  let potentialProfitTp2: number | null = null;
  let riskReward2: number | null = null;
  if (takeProfit2Price && Number.isFinite(takeProfit2Price) && takeProfit2Price > 0) {
    const tp2Dist = Math.abs(takeProfit2Price - entryPrice);
    potentialProfitTp2 = Number(((tp2Dist / specs.tickSize) * specs.tickValue * recommendedLots).toFixed(2));
    riskReward2 = Number((tp2Dist / stopDistance).toFixed(2));
  }

  return {
    valid: true,
    riskAmount: Number(riskAmount.toFixed(2)),
    stopDistance: Number(stopDistance.toFixed(4)),
    stopTicks: Math.round(stopTicks),
    rawLots: Number(rawLots.toFixed(4)),
    recommendedLots,
    actualRiskAmount: Number(actualRiskAmount.toFixed(2)),
    actualRiskPercent: Number(actualRiskPercent.toFixed(2)),
    potentialProfitTp1,
    potentialProfitTp2,
    riskReward1,
    riskReward2,
  };
}
