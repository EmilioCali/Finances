from decimal import Decimal

from pydantic import BaseModel, field_serializer

from app.engine.money import json_number


class Company(BaseModel):
    id: str
    name: str
    country: str
    currency: str


class CompanyList(BaseModel):
    companies: list[Company]


class CompanyCreate(BaseModel):
    name: str
    country: str
    currency: str


class ImportRow(BaseModel):
    row: int
    period: str | None = None
    categoryRaw: str
    category: str | None = None
    recordType: str | None = None
    currency: str | None = None
    amountOriginal: str | None = None
    status: str


class ImportError(BaseModel):
    row: int
    field: str | None = None
    message: str


class ImportResult(BaseModel):
    importId: str
    companyId: str
    fileName: str
    dryRun: bool
    accepted: int
    rejected: int
    duplicates: int
    rows: list[ImportRow]
    errors: list[ImportError]


class FxRate(BaseModel):
    currency: str
    unitsPerUsd: str


class MoneyTotals(BaseModel):
    revenue: str
    expense: str
    operatingResult: str


class CategoryAmount(BaseModel):
    category: str
    recordType: str
    amount: str


class SeriesPoint(BaseModel):
    period: str
    revenue: str
    expense: str
    operatingResult: str


class TraceLine(BaseModel):
    id: str
    companyId: str
    period: str
    categoryRaw: str
    category: str
    recordType: str
    currency: str
    amountOriginal: str
    fxRate: str
    amountReporting: str
    sourceFile: str
    sourceRow: int


class CompanySlice(BaseModel):
    companyId: str
    revenue: str
    expense: str
    operatingResult: str


class Consolidation(BaseModel):
    reportingCurrency: str
    period: str | None
    fxRates: list[FxRate]
    totals: MoneyTotals
    byCompany: list[CompanySlice]
    byCategory: list[CategoryAmount]
    series: list[SeriesPoint]
    lines: list[TraceLine]


class AdjustmentIn(BaseModel):
    type: str
    currency: str | None = None
    companyId: str | None = None
    percentage: float


class AdjustmentOut(BaseModel):
    type: str
    currency: str | None = None
    percentage: Decimal
    companyId: str | None = None

    @field_serializer("percentage")
    def serialize_percentage(self, value: Decimal, _info) -> int | float:
        return json_number(value)


class ScenarioCreate(BaseModel):
    name: str
    adjustments: list[AdjustmentIn]


class ScenarioCreated(BaseModel):
    id: str
    name: str
    adjustments: list[AdjustmentOut]
    createdAt: str


class Variance(BaseModel):
    absolute: str
    percentage: str | None = None


class VarianceSet(BaseModel):
    revenue: Variance
    expense: Variance
    operatingResult: Variance


class CompanyComparison(BaseModel):
    companyId: str
    base: MoneyTotals
    simulated: MoneyTotals
    variance: VarianceSet


class CategoryComparison(BaseModel):
    category: str
    recordType: str
    base: str
    simulated: str
    variance: Variance


class SeriesComparison(BaseModel):
    period: str
    base: MoneyTotals
    simulated: MoneyTotals


class FxComparison(BaseModel):
    base: list[FxRate]
    simulated: list[FxRate]


class ScenarioResults(BaseModel):
    scenarioId: str
    name: str
    reportingCurrency: str
    adjustments: list[AdjustmentOut]
    fxRates: FxComparison
    base: MoneyTotals
    simulated: MoneyTotals
    variance: VarianceSet
    byCompany: list[CompanyComparison]
    byCategory: list[CategoryComparison]
    series: list[SeriesComparison]
