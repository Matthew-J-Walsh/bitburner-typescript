import { CompanyName, JobField, NS } from '@ns';
import { Action, Check, defaultSleepTime } from '../constants';
import { DefaultFunctions } from './defaults';

export class CompanyFunctions extends DefaultFunctions {
    public static applyToCompany(
        ns: NS,
        company: CompanyName,
        field: JobField,
    ): Action {
        return async () => {
            ns.singularity.applyToCompany(company, field);
        };
    }

    public static workForCompany(
        ns: NS,
        company: CompanyName,
        field: JobField,
        reputationTarget: number,
    ): Action {
        return async () => {
            while (ns.singularity.getCompanyRep(company) < reputationTarget) {
                ns.singularity.applyToCompany(company, field);
                ns.singularity.workForCompany(company);
                await ns.sleep(60_000); // we need to check for promotations q.q
            }
        };
    }
}
