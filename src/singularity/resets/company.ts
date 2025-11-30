import { CompanyName, JobField, NS } from '@ns';

export async function companyPartialReset(
    ns: NS,
    companyName: CompanyName,
    field: JobField,
) {
    while (ns.singularity.getCompanyRep(companyName) < 200000) {
        ns.singularity.applyToCompany(companyName, field);
        ns.singularity.workForCompany(companyName);
        await ns.sleep(60_000); // we need to check for promotations q.q
    }
}
