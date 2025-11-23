import { CityName, FactionName, FactionWorkType, NS } from '@ns';
import { DefaultFunctions } from './utils/defaults';
import { executeEpic } from './utils/epic';
import { TrainingFunctions } from './utils/training';
import { FactionFunctions } from './utils/faction';
import { AugmentationFunctions } from './utils/augments';

export function BN4Epic1(ns: NS): Promise<void> {
    const augments: Partial<Record<FactionName, string[]>> = {
        'Tian Di Hui': [
            'Social Negotiation Assistant (S.N.A)',
            'ADR-V1 Pheromone Gene',
        ],
    };
    const reputations: Partial<Record<FactionName, number>> = {
        ...AugmentationFunctions.augmentRepHelper(ns, augments),
    };
    const bn4e1stories = [
        TrainingFunctions.trainingStory(ns, { hacking: 50 }),
        DefaultFunctions.travelStory(ns, 'Chongquing' as CityName),
        FactionFunctions.factionStory(
            ns,
            'Tian Di Hui' as FactionName,
            'hacking' as FactionWorkType,
            reputations['Tian Di Hui'],
        ),
        AugmentationFunctions.augmentResetStory(ns, augments, true),
    ];

    return executeEpic(bn4e1stories);
}
