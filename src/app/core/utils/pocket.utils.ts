import { PocketType } from '../models/pocket.model';

export function normalizeType(type: string): PocketType {
    const map: Record<string, PocketType> = {
        'BankAccount': 'BANK_ACCOUNT',
        'BenefitAccount': 'BENEFIT_ACCOUNT',
        'FgtsEmployerAccount': 'FGTS_EMPLOYER_ACCOUNT',
        'Cash': 'CASH',
    };
    return map[type] ?? type as PocketType;
}