import { describe, it, expect, beforeEach } from "vitest";
import { uintCV, stringUtf8CV } from "@stacks/transactions";

const ERR_NOT_AUTHORIZED = 100;
const ERR_INVALID_FARM_ID = 101;
const ERR_INVALID_AMOUNT = 102;
const ERR_INVALID_TIMESTAMP = 103;
const ERR_INVALID_QUOTA = 104;
const ERR_INVALID_PERIOD = 105;
const ERR_FARM_ALREADY_REGISTERED = 106;
const ERR_FARM_NOT_FOUND = 107;
const ERR_LOG_ALREADY_EXISTS = 108;
const ERR_ORACLE_NOT_VERIFIED = 109;
const ERR_INVALID_MIN_USAGE = 110;
const ERR_INVALID_MAX_USAGE = 111;
const ERR_UPDATE_NOT_ALLOWED = 112;
const ERR_INVALID_UPDATE_PARAM = 113;
const ERR_MAX_LOGS_EXCEEDED = 114;
const ERR_INVALID_USAGE_TYPE = 115;
const ERR_INVALID_EFFICIENCY_RATE = 116;
const ERR_INVALID_GRACE_PERIOD = 117;
const ERR_INVALID_LOCATION = 118;
const ERR_INVALID_UNIT = 119;
const ERR_INVALID_STATUS = 120;

interface Farm {
  owner: string;
  quota: number;
  totalUsage: number;
  lastUpdate: number;
  efficiencyRate: number;
  period: number;
  location: string;
  unit: string;
  status: boolean;
  minUsage: number;
  maxUsage: number;
  usageType: string;
  gracePeriod: number;
}

interface UsageLog {
  amount: number;
  timestamp: number;
  reporter: string;
}

interface FarmUpdate {
  updateQuota: number;
  updateEfficiencyRate: number;
  updateTimestamp: number;
  updater: string;
}

interface Result<T> {
  ok: boolean;
  value: T;
}

class WaterUsageTrackerMock {
  state: {
    nextLogId: number;
    maxLogs: number;
    loggingFee: number;
    oracleContract: string | null;
    farms: Map<number, Farm>;
    farmUpdates: Map<number, FarmUpdate>;
    farmsByOwner: Map<string, number>;
    usageLogs: Map<string, UsageLog>;
  } = {
    nextLogId: 0,
    maxLogs: 10000,
    loggingFee: 500,
    oracleContract: null,
    farms: new Map(),
    farmUpdates: new Map(),
    farmsByOwner: new Map(),
    usageLogs: new Map(),
  };
  blockHeight: number = 0;
  caller: string = "ST1TEST";
  oracles: Set<string> = new Set(["ST1TEST"]);
  stxTransfers: Array<{ amount: number; from: string; to: string | null }> = [];

  constructor() {
    this.reset();
  }

  reset() {
    this.state = {
      nextLogId: 0,
      maxLogs: 10000,
      loggingFee: 500,
      oracleContract: null,
      farms: new Map(),
      farmUpdates: new Map(),
      farmsByOwner: new Map(),
      usageLogs: new Map(),
    };
    this.blockHeight = 0;
    this.caller = "ST1TEST";
    this.oracles = new Set(["ST1TEST"]);
    this.stxTransfers = [];
  }

  isVerifiedOracle(principal: string): Result<boolean> {
    return { ok: true, value: this.oracles.has(principal) };
  }

  setOracleContract(contractPrincipal: string): Result<boolean> {
    if (contractPrincipal === "SP000000000000000000002Q6VF78") {
      return { ok: false, value: false };
    }
    if (this.state.oracleContract !== null) {
      return { ok: false, value: false };
    }
    this.state.oracleContract = contractPrincipal;
    return { ok: true, value: true };
  }

  setLoggingFee(newFee: number): Result<boolean> {
    if (!this.state.oracleContract) return { ok: false, value: false };
    this.state.loggingFee = newFee;
    return { ok: true, value: true };
  }

  registerFarm(
    quota: number,
    efficiencyRate: number,
    period: number,
    location: string,
    unit: string,
    minUsage: number,
    maxUsage: number,
    usageType: string,
    gracePeriod: number
  ): Result<number> {
    if (this.state.nextLogId >= this.state.maxLogs) return { ok: false, value: ERR_MAX_LOGS_EXCEEDED };
    if (quota <= 0) return { ok: false, value: ERR_INVALID_QUOTA };
    if (efficiencyRate > 100) return { ok: false, value: ERR_INVALID_EFFICIENCY_RATE };
    if (period <= 0) return { ok: false, value: ERR_INVALID_PERIOD };
    if (!location || location.length > 100) return { ok: false, value: ERR_INVALID_LOCATION };
    if (!["liters", "gallons", "cubic-meters"].includes(unit)) return { ok: false, value: ERR_INVALID_UNIT };
    if (minUsage <= 0) return { ok: false, value: ERR_INVALID_MIN_USAGE };
    if (maxUsage <= 0) return { ok: false, value: ERR_INVALID_MAX_USAGE };
    if (!["irrigation", "domestic", "industrial"].includes(usageType)) return { ok: false, value: ERR_INVALID_USAGE_TYPE };
    if (gracePeriod > 30) return { ok: false, value: ERR_INVALID_GRACE_PERIOD };
    if (this.state.farmsByOwner.has(this.caller)) return { ok: false, value: ERR_FARM_ALREADY_REGISTERED };
    if (!this.state.oracleContract) return { ok: false, value: ERR_ORACLE_NOT_VERIFIED };

    this.stxTransfers.push({ amount: this.state.loggingFee, from: this.caller, to: this.state.oracleContract });

    const id = this.state.nextLogId;
    const farm: Farm = {
      owner: this.caller,
      quota,
      totalUsage: 0,
      lastUpdate: this.blockHeight,
      efficiencyRate,
      period,
      location,
      unit,
      status: true,
      minUsage,
      maxUsage,
      usageType,
      gracePeriod,
    };
    this.state.farms.set(id, farm);
    this.state.farmsByOwner.set(this.caller, id);
    this.state.nextLogId++;
    return { ok: true, value: id };
  }

  getFarm(id: number): Farm | null {
    return this.state.farms.get(id) || null;
  }

  logUsage(farmId: number, amount: number, timestamp: number): Result<boolean> {
    const farm = this.state.farms.get(farmId);
    if (!farm) return { ok: false, value: false };
    if (farm.owner !== this.caller && this.caller !== this.state.oracleContract) return { ok: false, value: false };
    if (amount <= 0) return { ok: false, value: false };
    if (timestamp < this.blockHeight) return { ok: false, value: false };

    const logKey = `${farmId}-${this.state.usageLogs.size}`;
    this.state.usageLogs.set(logKey, { amount, timestamp, reporter: this.caller });

    const updated: Farm = {
      ...farm,
      totalUsage: farm.totalUsage + amount,
      lastUpdate: timestamp,
    };
    this.state.farms.set(farmId, updated);
    return { ok: true, value: true };
  }

  updateFarm(id: number, updateQuota: number, updateEfficiencyRate: number): Result<boolean> {
    const farm = this.state.farms.get(id);
    if (!farm) return { ok: false, value: false };
    if (farm.owner !== this.caller) return { ok: false, value: false };
    if (updateQuota <= 0) return { ok: false, value: false };
    if (updateEfficiencyRate > 100) return { ok: false, value: false };

    const updated: Farm = {
      ...farm,
      quota: updateQuota,
      efficiencyRate: updateEfficiencyRate,
      lastUpdate: this.blockHeight,
    };
    this.state.farms.set(id, updated);
    this.state.farmUpdates.set(id, {
      updateQuota,
      updateEfficiencyRate,
      updateTimestamp: this.blockHeight,
      updater: this.caller,
    });
    return { ok: true, value: true };
  }

  getFarmCount(): Result<number> {
    return { ok: true, value: this.state.nextLogId };
  }

  checkFarmExistence(owner: string): Result<boolean> {
    return { ok: true, value: this.state.farmsByOwner.has(owner) };
  }

  calculateRemainingQuota(farmId: number): number {
    const farm = this.state.farms.get(farmId);
    return farm ? farm.quota - farm.totalUsage : 0;
  }
}

describe("WaterUsageTracker", () => {
  let contract: WaterUsageTrackerMock;

  beforeEach(() => {
    contract = new WaterUsageTrackerMock();
    contract.reset();
  });

  it("registers a farm successfully", () => {
    contract.setOracleContract("ST2TEST");
    const result = contract.registerFarm(
      10000,
      80,
      30,
      "FarmLocation",
      "liters",
      100,
      5000,
      "irrigation",
      7
    );
    expect(result.ok).toBe(true);
    expect(result.value).toBe(0);

    const farm = contract.getFarm(0);
    expect(farm?.quota).toBe(10000);
    expect(farm?.efficiencyRate).toBe(80);
    expect(farm?.period).toBe(30);
    expect(farm?.location).toBe("FarmLocation");
    expect(farm?.unit).toBe("liters");
    expect(farm?.minUsage).toBe(100);
    expect(farm?.maxUsage).toBe(5000);
    expect(farm?.usageType).toBe("irrigation");
    expect(farm?.gracePeriod).toBe(7);
    expect(contract.stxTransfers).toEqual([{ amount: 500, from: "ST1TEST", to: "ST2TEST" }]);
  });

  it("rejects duplicate farm registrations", () => {
    contract.setOracleContract("ST2TEST");
    contract.registerFarm(
      10000,
      80,
      30,
      "FarmLocation",
      "liters",
      100,
      5000,
      "irrigation",
      7
    );
    const result = contract.registerFarm(
      20000,
      90,
      60,
      "AnotherLocation",
      "gallons",
      200,
      10000,
      "domestic",
      14
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_FARM_ALREADY_REGISTERED);
  });

  it("rejects non-authorized caller for logging", () => {
    contract.setOracleContract("ST2TEST");
    contract.registerFarm(
      10000,
      80,
      30,
      "FarmLocation",
      "liters",
      100,
      5000,
      "irrigation",
      7
    );
    contract.caller = "ST3FAKE";
    const result = contract.logUsage(0, 500, contract.blockHeight + 1);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("logs usage successfully", () => {
    contract.setOracleContract("ST2TEST");
    contract.registerFarm(
      10000,
      80,
      30,
      "FarmLocation",
      "liters",
      100,
      5000,
      "irrigation",
      7
    );
    const result = contract.logUsage(0, 500, contract.blockHeight + 1);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const farm = contract.getFarm(0);
    expect(farm?.totalUsage).toBe(500);
    expect(farm?.lastUpdate).toBe(contract.blockHeight + 1);
  });

  it("rejects farm registration without oracle contract", () => {
    const result = contract.registerFarm(
      10000,
      80,
      30,
      "FarmLocation",
      "liters",
      100,
      5000,
      "irrigation",
      7
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_ORACLE_NOT_VERIFIED);
  });

  it("rejects invalid quota", () => {
    contract.setOracleContract("ST2TEST");
    const result = contract.registerFarm(
      0,
      80,
      30,
      "FarmLocation",
      "liters",
      100,
      5000,
      "irrigation",
      7
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_QUOTA);
  });

  it("rejects invalid efficiency rate", () => {
    contract.setOracleContract("ST2TEST");
    const result = contract.registerFarm(
      10000,
      101,
      30,
      "FarmLocation",
      "liters",
      100,
      5000,
      "irrigation",
      7
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_EFFICIENCY_RATE);
  });

  it("rejects invalid usage type", () => {
    contract.setOracleContract("ST2TEST");
    const result = contract.registerFarm(
      10000,
      80,
      30,
      "FarmLocation",
      "liters",
      100,
      5000,
      "invalid",
      7
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_USAGE_TYPE);
  });

  it("updates a farm successfully", () => {
    contract.setOracleContract("ST2TEST");
    contract.registerFarm(
      10000,
      80,
      30,
      "FarmLocation",
      "liters",
      100,
      5000,
      "irrigation",
      7
    );
    const result = contract.updateFarm(0, 15000, 85);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const farm = contract.getFarm(0);
    expect(farm?.quota).toBe(15000);
    expect(farm?.efficiencyRate).toBe(85);
    const update = contract.state.farmUpdates.get(0);
    expect(update?.updateQuota).toBe(15000);
    expect(update?.updateEfficiencyRate).toBe(85);
    expect(update?.updater).toBe("ST1TEST");
  });

  it("rejects update for non-existent farm", () => {
    contract.setOracleContract("ST2TEST");
    const result = contract.updateFarm(99, 15000, 85);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("rejects update by non-owner", () => {
    contract.setOracleContract("ST2TEST");
    contract.registerFarm(
      10000,
      80,
      30,
      "FarmLocation",
      "liters",
      100,
      5000,
      "irrigation",
      7
    );
    contract.caller = "ST3FAKE";
    const result = contract.updateFarm(0, 15000, 85);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("sets logging fee successfully", () => {
    contract.setOracleContract("ST2TEST");
    const result = contract.setLoggingFee(1000);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.state.loggingFee).toBe(1000);
    contract.registerFarm(
      10000,
      80,
      30,
      "FarmLocation",
      "liters",
      100,
      5000,
      "irrigation",
      7
    );
    expect(contract.stxTransfers).toEqual([{ amount: 1000, from: "ST1TEST", to: "ST2TEST" }]);
  });

  it("rejects logging fee change without oracle contract", () => {
    const result = contract.setLoggingFee(1000);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("returns correct farm count", () => {
    contract.setOracleContract("ST2TEST");
    contract.registerFarm(
      10000,
      80,
      30,
      "FarmLocation",
      "liters",
      100,
      5000,
      "irrigation",
      7
    );
    contract.caller = "ST4TEST";
    contract.registerFarm(
      20000,
      90,
      60,
      "AnotherLocation",
      "gallons",
      200,
      10000,
      "domestic",
      14
    );
    const result = contract.getFarmCount();
    expect(result.ok).toBe(true);
    expect(result.value).toBe(2);
  });

  it("checks farm existence correctly", () => {
    contract.setOracleContract("ST2TEST");
    contract.registerFarm(
      10000,
      80,
      30,
      "FarmLocation",
      "liters",
      100,
      5000,
      "irrigation",
      7
    );
    const result = contract.checkFarmExistence("ST1TEST");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const result2 = contract.checkFarmExistence("STNON");
    expect(result2.ok).toBe(true);
    expect(result2.value).toBe(false);
  });

  it("rejects farm registration with empty location", () => {
    contract.setOracleContract("ST2TEST");
    const result = contract.registerFarm(
      10000,
      80,
      30,
      "",
      "liters",
      100,
      5000,
      "irrigation",
      7
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_LOCATION);
  });

  it("rejects farm registration with max logs exceeded", () => {
    contract.setOracleContract("ST2TEST");
    contract.state.maxLogs = 1;
    contract.registerFarm(
      10000,
      80,
      30,
      "FarmLocation",
      "liters",
      100,
      5000,
      "irrigation",
      7
    );
    const result = contract.registerFarm(
      20000,
      90,
      60,
      "AnotherLocation",
      "gallons",
      200,
      10000,
      "domestic",
      14
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_MAX_LOGS_EXCEEDED);
  });

  it("sets oracle contract successfully", () => {
    const result = contract.setOracleContract("ST2TEST");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.state.oracleContract).toBe("ST2TEST");
  });

  it("rejects invalid oracle contract", () => {
    const result = contract.setOracleContract("SP000000000000000000002Q6VF78");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("calculates remaining quota correctly", () => {
    contract.setOracleContract("ST2TEST");
    contract.registerFarm(
      10000,
      80,
      30,
      "FarmLocation",
      "liters",
      100,
      5000,
      "irrigation",
      7
    );
    contract.logUsage(0, 3000, contract.blockHeight + 1);
    const remaining = contract.calculateRemainingQuota(0);
    expect(remaining).toBe(7000);
  });
});