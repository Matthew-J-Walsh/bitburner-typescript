import { CompanyName, JobField, NS } from '@ns';
import { Action, Check, defaultSleepTime } from '../constants';
import { DefaultFunctions } from './defaults';
import { Story } from './story';

export class GraftingFunctions extends DefaultFunctions {
    public static graftingStory(ns: NS, augName: string): Story {
        return new Story(
            ns,
            GraftingFunctions.aboveMoney(
                ns,
                ns.grafting.getAugmentationGraftPrice(augName),
            ),
            GraftingFunctions.graft(ns, augName),
        );
    }

    public static graft(ns: NS, augName: string): Action {
        return async () => {
            if (ns.grafting.graftAugmentation(augName)) {
                await ns.sleep(ns.grafting.getAugmentationGraftTime(augName));
                while (ns.singularity.getCurrentWork()!.type === 'GRAFTING')
                    await ns.sleep(defaultSleepTime);
            } else throw new Error('Tried to incorrectly start graft');
        };
    }
}
