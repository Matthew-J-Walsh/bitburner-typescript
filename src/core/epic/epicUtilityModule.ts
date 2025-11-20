import { NS } from '@ns';
import { BaseModule } from '/lib/baseModule';
import { BackgroundTask, PriorityTask } from '/lib/scheduler';
import { Story, Epic } from '/core/epic/epicModule';

export class EpicUtilityModule {
    public static readEpic(filename: string): Epic {}
}
