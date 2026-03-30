export type TransactionInput = {
  date: string;
  amount: number;
};

export type TransactionOutput = TransactionInput & {
  ceiling: number;
  remanent: number;
};

export type TransactionWithCalculated = TransactionOutput;

export type InvalidTransaction = {
  date: string;
  amount: number;
  message: string;
};

export type QPeriod = {
  fixed: number;
  start: string;
  end: string;
};

export type PPeriod = {
  extra: number;
  start: string;
  end: string;
};

export type KPeriod = {
  start: string;
  end: string;
};

export type FilterRequest = {
  wage: number;
  transactions: TransactionInput[];
  q: QPeriod[];
  p: PPeriod[];
  k: KPeriod[];
};

export type FilterResponse = {
  valid: Array<TransactionOutput & { inKPeriod: boolean }>;
  invalid: InvalidTransaction[];
};

export type ValidateRequest = {
  wage: number;
  transactions: TransactionWithCalculated[];
};

export type ValidateResponse = {
  valid: TransactionWithCalculated[];
  invalid: InvalidTransaction[];
};

export type ParseResponse = {
  transactions: TransactionOutput[];
};

export type ReturnsRequest = {
  age: number;
  wage: number;
  inflation: number;
  transactions: TransactionInput[];
  q: QPeriod[];
  p: PPeriod[];
  k: KPeriod[];
};

export type SavingsByDate = {
  start: string;
  end: string;
  amount: number;
  profit: number;
  taxBenefit: number;
  projectionYears: number;
  projectedCorpusAt60: number;
  explanation: string;
};

export type ReturnsResponse = {
  transactionsTotalAmount: number;
  transactionsTotalCeiling: number;
  savingsByDates: SavingsByDate[];
  projectionTargetAge: number;
  investmentHorizonYears: number;
  totalInvestedAmount: number;
  retirementCorpusAt60: number;
  responseMessage: string;
};

export type PerformanceResponse = {
  time: string;
  memory: string;
  threads: number;
};
