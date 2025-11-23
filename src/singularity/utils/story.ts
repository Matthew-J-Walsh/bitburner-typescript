import { NS } from '@ns';
import { Action, Check } from '../constants';
import { CrimeFunctions } from './crime';

export class Story {
    constructor(
        protected ns: NS,
        protected start: Check,
        protected action: Action,
        protected fallback?: Action,
    ) {}

    public async execute(): Promise<void> {
        while (!this.start()) {
            if (!this.fallback) CrimeFunctions.farmMoney(this.ns);
            else await this.fallback();
        }
        await this.action();
    }
}
