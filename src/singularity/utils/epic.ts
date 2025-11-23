import { Story } from './story';

export function executeEpic(stories: Story[]): Promise<void> {
    return stories.reduce(
        (chain, story) => chain.then(() => story.execute()),
        Promise.resolve(),
    );
}
