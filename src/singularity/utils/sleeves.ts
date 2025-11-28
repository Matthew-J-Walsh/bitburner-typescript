import { NS } from '@ns';
import { DefaultFunctions } from './defaults';

export class SleeveFunctions extends DefaultFunctions {
    public static sleeveBlock(ns: NS, sleeveNumber: number): boolean {
        if (ns.sleeve.getSleeve(sleeveNumber).shock > 0) {
            ns.sleeve.setToShockRecovery(sleeveNumber);
            return true;
        }
        return false;
    }
}
