from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from typing import List, Tuple, Optional
from pydantic import BaseModel, Field
from datetime import datetime, timedelta
import uvicorn
import psutil
import os
import threading
import time

SERVER_HOST = "127.0.0.1"
SERVER_PORT = 5477

class TransactionInput(BaseModel):
    date: str = Field(..., description="Date-time in format YYYY-MM-DD HH:mm:ss")
    amount: float = Field(..., description="Transaction amount")


class TransactionOutput(BaseModel):
    date: str = Field(..., description="Date-time in format YYYY-MM-DD HH:mm:ss")
    amount: float = Field(..., description="Transaction amount")
    ceiling: float = Field(..., description="Next multiple of 100 (calculated)")
    remanent: float = Field(..., description="Difference between ceiling and amount (calculated)")


class TransactionWithCalculated(BaseModel):
    date: str = Field(..., description="Date-time in format YYYY-MM-DD HH:mm:ss")
    amount: float = Field(..., description="Transaction amount")
    ceiling: float = Field(..., description="Pre-calculated ceiling")
    remanent: float = Field(..., description="Pre-calculated remanent")


class TransactionParseResponse(BaseModel):
    transactions: List[TransactionOutput] = Field(..., description="List of parsed transactions with calculated ceiling and remanent")


class ValidTransaction(TransactionWithCalculated):
    pass


class InvalidTransactionWithMessage(BaseModel):
    date: str = Field(..., description="Date-time in format YYYY-MM-DD HH:mm:ss")
    amount: float = Field(..., description="Transaction amount")
    message: str = Field(..., description="Explanation of the validation error")


class TransactionValidateRequest(BaseModel):
    wage: float = Field(..., description="Annual wage/salary")
    transactions: List[TransactionWithCalculated] = Field(..., description="List of transactions with pre-calculated ceiling and remanent")


class TransactionValidateResponse(BaseModel):
    valid: List[ValidTransaction] = Field(..., description="List of valid transactions")
    invalid: List[InvalidTransactionWithMessage] = Field(..., description="List of invalid transactions with error messages")


class QPeriod(BaseModel):
    fixed: float = Field(..., description="Fixed investment amount for this period")
    start: str = Field(..., description="Start date-time in format YYYY-MM-DD HH:mm:ss")
    end: str = Field(..., description="End date-time in format YYYY-MM-DD HH:mm:ss")


class PPeriod(BaseModel):
    extra: float = Field(..., description="Extra amount to add to remanent")
    start: str = Field(..., description="Start date-time in format YYYY-MM-DD HH:mm:ss")
    end: str = Field(..., description="End date-time in format YYYY-MM-DD HH:mm:ss")


class KPeriod(BaseModel):
    start: str = Field(..., description="Start date-time in format YYYY-MM-DD HH:mm:ss")
    end: str = Field(..., description="End date-time in format YYYY-MM-DD HH:mm:ss")


class TransactionFilterRequest(BaseModel):
    wage: float = Field(..., description="Annual wage/salary")
    transactions: List[TransactionInput] = Field(..., description="List of transactions (date and amount only)")
    q: Optional[List[QPeriod]] = Field(default=[], description="List of q periods (fixed amount override)")
    p: Optional[List[PPeriod]] = Field(default=[], description="List of p periods (extra amount addition)")
    k: Optional[List[KPeriod]] = Field(default=[], description="List of k periods (evaluation grouping)")


class FilteredValidTransaction(TransactionOutput):
    inKPeriod: bool = Field(..., description="Whether transaction falls within any k period")


class TransactionFilterResponse(BaseModel):
    valid: List[FilteredValidTransaction] = Field(..., description="List of valid transactions with inKPeriod flag")
    invalid: List[InvalidTransactionWithMessage] = Field(..., description="List of invalid transactions with error messages")


class ReturnsRequest(BaseModel):
    age: int = Field(..., description="Age of the investor")
    wage: float = Field(..., description="Monthly wage/salary")
    inflation: float = Field(..., description="Inflation rate as percentage")
    transactions: List[TransactionInput] = Field(..., description="List of transactions (date and amount only)")
    q: Optional[List[QPeriod]] = Field(default=[], description="List of q periods (fixed amount override)")
    p: Optional[List[PPeriod]] = Field(default=[], description="List of p periods (extra amount addition)")
    k: List[KPeriod] = Field(..., description="List of k periods (evaluation grouping)")


class SavingsByDate(BaseModel):
    start: str = Field(..., description="Start date-time of k period")
    end: str = Field(..., description="End date-time of k period")
    amount: float = Field(..., description="Total remanent amount invested in this k period")
    profit: float = Field(..., description="Profit from investment (compounded interest)")
    taxBenefit: float = Field(..., description="Tax benefit (NPS only, 0 for index)")


class ReturnsResponse(BaseModel):
    transactionsTotalAmount: float = Field(..., description="Sum of valid transaction amounts")
    transactionsTotalCeiling: float = Field(..., description="Sum of valid transaction ceilings")
    savingsByDates: List[SavingsByDate] = Field(..., description="Savings breakdown by k periods")


class PerformanceResponse(BaseModel):
    time: str = Field(..., description="System uptime in format 'YYYY-MM-DD HH:mm:ss.SSS' (current date with duration time)")
    memory: str = Field(..., description="Memory usage in megabytes, format: 'XXX.XX MB'")
    threads: int = Field(..., description="Number of active threads")


def calculate_ceiling(amount: float) -> float:
    if amount <= 0:
        return 0.0
    return ((int(amount) + 99) // 100) * 100


def calculate_remanent(amount: float, ceiling: float) -> float:
    return max(0.0, ceiling - amount)


def validate_transaction(transaction: TransactionInput, seen_transactions: set) -> Tuple[bool, Optional[str]]:
    if transaction.amount < 0:
        return False, "Negative amounts are not allowed"
    
    transaction_key = (transaction.date, transaction.amount)
    if transaction_key in seen_transactions:
        return False, "Duplicate transaction"
    
    seen_transactions.add(transaction_key)
    return True, None


def validate_transaction_with_calculated(transaction: TransactionWithCalculated, seen_transactions: set) -> Tuple[bool, Optional[str]]:
    if transaction.amount < 0:
        return False, "Negative amounts are not allowed"
    
    transaction_key = (transaction.date, transaction.amount)
    if transaction_key in seen_transactions:
        return False, "Duplicate transaction"
    
    seen_transactions.add(transaction_key)
    return True, None


def parse_datetime(date_str: str) -> Optional[datetime]:
    try:
        return datetime.strptime(date_str, "%Y-%m-%d %H:%M:%S")
    except ValueError:
        return None


def is_date_in_range(transaction_date: str, start: str, end: str) -> bool:
    trans_dt = parse_datetime(transaction_date)
    start_dt = parse_datetime(start)
    end_dt = parse_datetime(end)
    
    if not all([trans_dt, start_dt, end_dt]):
        return False
    
    return start_dt <= trans_dt <= end_dt


def apply_q_period_rules(transaction_date: str, remanent: float, q_periods: List[QPeriod]) -> float:
    matching_periods = [
        q for q in q_periods 
        if is_date_in_range(transaction_date, q.start, q.end)
    ]
    
    if not matching_periods:
        return remanent
    
    matching_periods.sort(key=lambda q: parse_datetime(q.start) or datetime.min, reverse=True)
    
    return matching_periods[0].fixed


def apply_p_period_rules(transaction_date: str, remanent: float, p_periods: List[PPeriod]) -> float:
    matching_periods = [
        p for p in p_periods 
        if is_date_in_range(transaction_date, p.start, p.end)
    ]
    
    if not matching_periods:
        return remanent
    
    total_extra = sum(p.extra for p in matching_periods)
    return remanent + total_extra


def is_in_k_period(transaction_date: str, k_periods: List[KPeriod]) -> bool:
    return any(
        is_date_in_range(transaction_date, k.start, k.end)
        for k in k_periods
    )


def calculate_tax(income: float) -> float:
    taxable_income = max(0.0, income)

    if taxable_income <= 700000:
        return 0.0
    elif taxable_income <= 1000000:
        return (taxable_income - 700000) * 0.10
    elif taxable_income <= 1200000:
        return 30000 + (taxable_income - 1000000) * 0.15
    elif taxable_income <= 1500000:
        return 60000 + (taxable_income - 1200000) * 0.20
    else:
        return 120000 + (taxable_income - 1500000) * 0.30


def calculate_nps_tax_benefit(wage: float, invested_amount: float) -> float:
    # Challenge examples provide wage as monthly salary.
    annual_income = wage * 12
    nps_deduction = min(invested_amount, annual_income * 0.10, 200000.0)
    tax_without_nps = calculate_tax(annual_income)
    tax_with_nps = calculate_tax(annual_income - nps_deduction)
    return tax_without_nps - tax_with_nps


def calculate_profit(principal: float, interest_rate: float, years: float = 1.0) -> float:
    rate = interest_rate / 100.0
    return principal * ((1 + rate) ** years - 1)


def process_transaction(transaction_date: datetime, amount: float, q_periods: List[QPeriod], p_periods: List[PPeriod]) -> Tuple[float, float]:
    ceiling = calculate_ceiling(amount)
    remanent = calculate_remanent(amount, ceiling)
    
    date_str = transaction_date.strftime("%Y-%m-%d %H:%M:%S")
    
    remanent = apply_q_period_rules(date_str, remanent, q_periods)
    
    remanent = apply_p_period_rules(date_str, remanent, p_periods)
    
    return ceiling, remanent


def calculate_compound_interest(principal: float, interest_rate: float, years: float) -> float:
    return principal * ((1 + interest_rate) ** years)


def adjust_inflation(amount: float, inflation_rate: float, years: float) -> float:
    inflation_decimal = inflation_rate / 100.0
    return amount / ((1 + inflation_decimal) ** years)


def calculate_real_profit(principal: float, annual_rate_percent: float, inflation_percent: float, years: float) -> float:
    future_value = calculate_compound_interest(principal, annual_rate_percent / 100.0, years)
    inflation_adjusted_value = adjust_inflation(future_value, inflation_percent, years)
    return inflation_adjusted_value - principal


def process_transactions_for_returns(
    transactions: List[TransactionInput],
    q_periods: List[QPeriod],
    p_periods: List[PPeriod],
    k_periods: List[KPeriod]
) -> Tuple[List[TransactionOutput], List[InvalidTransactionWithMessage]]:
    valid_transactions = []
    invalid_transactions = []
    seen_transactions = set()
    
    for transaction in transactions:
        is_valid, error_message = validate_transaction(transaction, seen_transactions)
        
        if not is_valid:
            invalid_transactions.append(
                InvalidTransactionWithMessage(
                    date=transaction.date,
                    amount=transaction.amount,
                    message=error_message
                )
            )
            continue
        
        ceiling = calculate_ceiling(transaction.amount)
        remanent = calculate_remanent(transaction.amount, ceiling)
        
        remanent = apply_q_period_rules(transaction.date, remanent, q_periods)
        
        remanent = apply_p_period_rules(transaction.date, remanent, p_periods)
        
        valid_transactions.append(
            TransactionOutput(
                date=transaction.date,
                amount=transaction.amount,
                ceiling=ceiling,
                remanent=remanent
            )
        )
    
    return valid_transactions, invalid_transactions


def calculate_savings_by_k_periods(
    valid_transactions: List[TransactionOutput],
    k_periods: List[KPeriod]
) -> List[Tuple[KPeriod, float]]:
    savings_by_period = []
    
    for k_period in k_periods:
        total_amount = 0.0
        for transaction in valid_transactions:
            if is_date_in_range(transaction.date, k_period.start, k_period.end):
                total_amount += float(transaction.remanent)
        savings_by_period.append((k_period, float(total_amount)))
    
    return savings_by_period


app = FastAPI(
    title="Self-Savings Retirement Platform",
    description="APIs for automated retirement savings through expense-based micro-investments",
    version="1.0.0"
)

app_start_time = time.time()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/", include_in_schema=False)
async def root():
    return RedirectResponse(url="/docs")


@app.post("/blackrock/challenge/v1/transactions:parse", response_model=TransactionParseResponse)
async def parse_transactions(transactions: List[TransactionInput]):
    try:
        parsed = []
        for transaction in transactions:
            ceiling = calculate_ceiling(transaction.amount)
            remanent = calculate_remanent(transaction.amount, ceiling)
            parsed_transaction = TransactionOutput(
                date=transaction.date,
                amount=transaction.amount,
                ceiling=ceiling,
                remanent=remanent
            )
            parsed.append(parsed_transaction)
        return TransactionParseResponse(transactions=parsed)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error parsing transactions: {str(e)}")


@app.post("/blackrock/challenge/v1/transactions:validate", response_model=TransactionValidateResponse)
async def validate_transactions(request: TransactionValidateRequest):
    try:
        valid_transactions = []
        invalid_transactions = []
        seen_transactions = set()
        
        for transaction in request.transactions:
            is_valid, error_message = validate_transaction_with_calculated(transaction, seen_transactions)
            
            if is_valid:
                valid_transactions.append(
                    ValidTransaction(
                        date=transaction.date,
                        amount=transaction.amount,
                        ceiling=transaction.ceiling,
                        remanent=transaction.remanent
                    )
                )
            else:
                invalid_transactions.append(
                    InvalidTransactionWithMessage(
                        date=transaction.date,
                        amount=transaction.amount,
                        message=error_message
                    )
                )
        
        return TransactionValidateResponse(
            valid=valid_transactions,
            invalid=invalid_transactions
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error validating transactions: {str(e)}")


@app.post("/blackrock/challenge/v1/transactions:filter", response_model=TransactionFilterResponse)
async def filter_transactions(request: TransactionFilterRequest):
    try:
        valid_transactions = []
        invalid_transactions = []
        seen_transactions = set()
        
        q_periods = request.q if request.q else []
        p_periods = request.p if request.p else []
        k_periods = request.k if request.k else []
        
        for transaction in request.transactions:
            is_valid, error_message = validate_transaction(transaction, seen_transactions)
            
            if not is_valid:
                invalid_transactions.append(
                    InvalidTransactionWithMessage(
                        date=transaction.date,
                        amount=transaction.amount,
                        message=error_message
                    )
                )
                continue
            
            ceiling = calculate_ceiling(transaction.amount)
            remanent = calculate_remanent(transaction.amount, ceiling)
            
            remanent = apply_q_period_rules(transaction.date, remanent, q_periods)
            
            remanent = apply_p_period_rules(transaction.date, remanent, p_periods)
            
            in_k_period = is_in_k_period(transaction.date, k_periods)
            
            valid_transactions.append(
                FilteredValidTransaction(
                    date=transaction.date,
                    amount=transaction.amount,
                    ceiling=ceiling,
                    remanent=remanent,
                    inKPeriod=in_k_period
                )
            )
        
        return TransactionFilterResponse(
            valid=valid_transactions,
            invalid=invalid_transactions
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error filtering transactions: {str(e)}")


@app.post("/blackrock/challenge/v1/returns:nps", response_model=ReturnsResponse)
async def calculate_nps_returns(request: ReturnsRequest):
    try:
        q_periods = request.q if request.q else []
        p_periods = request.p if request.p else []
        
        valid_transactions, invalid_transactions = process_transactions_for_returns(
            request.transactions, q_periods, p_periods, request.k
        )
        
        total_transaction_amount = sum(t.amount for t in valid_transactions)
        total_ceiling = sum(t.ceiling for t in valid_transactions)
        
        k_results = []
        for k in request.k:
            k_start = parse_datetime(k.start)
            k_end = parse_datetime(k.end)
            
            if not k_start or not k_end:
                continue
            
            period_remanent = 0.0
            for tx in valid_transactions:
                if is_date_in_range(tx.date, k.start, k.end):
                    period_remanent += float(tx.remanent)
            
            investment_years = max(1, 60 - request.age)
            
            real_profit = calculate_real_profit(
                period_remanent,
                7.11,
                request.inflation,
                investment_years
            )
            
            tax_benefit = calculate_nps_tax_benefit(request.wage, period_remanent)
            
            k_results.append(
                SavingsByDate(
                    start=k.start,
                    end=k.end,
                    amount=period_remanent,
                    profit=real_profit,
                    taxBenefit=tax_benefit
                )
            )
        
        return ReturnsResponse(
            transactionsTotalAmount=total_transaction_amount,
            transactionsTotalCeiling=total_ceiling,
            savingsByDates=k_results
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error calculating NPS returns: {str(e)}")


@app.post("/blackrock/challenge/v1/returns:index", response_model=ReturnsResponse)
async def calculate_index_returns(request: ReturnsRequest):
    try:
        q_periods = request.q if request.q else []
        p_periods = request.p if request.p else []
        
        valid_transactions, invalid_transactions = process_transactions_for_returns(
            request.transactions, q_periods, p_periods, request.k
        )
        
        total_transaction_amount = sum(t.amount for t in valid_transactions)
        total_ceiling = sum(t.ceiling for t in valid_transactions)
        
        savings_by_periods = calculate_savings_by_k_periods(valid_transactions, request.k)
        
        savings_by_dates = []
        for k_period, amount in savings_by_periods:
            investment_years = max(1, 60 - request.age)
            profit = calculate_real_profit(
                amount,
                14.49,
                request.inflation,
                investment_years
            )
            savings_by_dates.append(
                SavingsByDate(
                    start=k_period.start,
                    end=k_period.end,
                    amount=amount,
                    profit=profit,
                    taxBenefit=0.0
                )
            )
        
        return ReturnsResponse(
            transactionsTotalAmount=total_transaction_amount,
            transactionsTotalCeiling=total_ceiling,
            savingsByDates=savings_by_dates
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error calculating index returns: {str(e)}")


@app.get("/blackrock/challenge/v1/performance", response_model=PerformanceResponse)
async def get_performance():
    try:
        current_datetime = datetime.now()
        current_date = current_datetime.strftime("%Y-%m-%d")
        
        uptime_seconds = time.time() - app_start_time
        uptime_timedelta = timedelta(seconds=uptime_seconds)
        
        total_seconds = int(uptime_timedelta.total_seconds())
        hours = total_seconds // 3600
        minutes = (total_seconds % 3600) // 60
        seconds = total_seconds % 60
        milliseconds = int((uptime_seconds - total_seconds) * 1000)
        
        time_str = f"{current_date} {hours:02d}:{minutes:02d}:{seconds:02d}.{milliseconds:03d}"
        
        process = psutil.Process(os.getpid())
        memory_info = process.memory_info()
        memory_mb = memory_info.rss / (1024 * 1024)
        
        memory_str = f"{memory_mb:.2f} MB"
        
        thread_count = threading.active_count()
        
        return PerformanceResponse(
            time=time_str,
            memory=memory_str,
            threads=thread_count
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error retrieving performance metrics: {str(e)}")


if __name__ == "__main__":
    uvicorn.run(
        app,
        host=SERVER_HOST,
        port=SERVER_PORT,
        reload=False
    )
