import { NS } from '@ns';
import React from 'react';

// ============================================================================
// CONFIGURATION
// ============================================================================
const LOSE_BET = 1;
const WIN_BET = 1e8; // up to casino cap
const DEBUG_MODE = true;

// ============================================================================
// WIN CALCULATOR
// ============================================================================
type Card = number; // 1 = Ace, 2-10 = face value, 11 = J, 12 = Q, 13 = K

interface Action {
    bet: boolean; // The bet amount (true means we will win, false we will throw)
    hits: number; // Number of times to hit
    stay: boolean; // If we will need to press stay, false if we are going to overdraw
}

interface DPResult {
    maxValue: number;
    action: Action;
}

function getCardValue(card: Card): number {
    if (card === 1) return 11; // Ace
    if (card >= 11) return 10; // J, Q, K
    return card;
}

function calculateHandValue(cards: Card[]): number {
    let value = 0;
    let aces = 0;

    for (const card of cards) {
        if (card === 1) {
            aces++;
            value += 11;
        } else {
            value += getCardValue(card);
        }
    }

    while (value > 21 && aces > 0) {
        value -= 10;
        aces--;
    }

    return value;
}

function isNaturalBlackjack(cards: Card[]): boolean {
    if (cards.length !== 2) return false;
    const hasAce = cards.includes(1);
    const hasTen = cards.some((c) => c === 10 || c >= 11);
    return hasAce && hasTen;
}

function simulateHand(
    deck: Card[],
    startIdx: number,
    playerHits: number,
    maxBet: boolean,
): {
    cardsConsumed: number;
    payout: number;
    auto: boolean;
} {
    // Need at least 4 cards to start
    if (startIdx + 4 > deck.length) {
        return { cardsConsumed: 0, payout: maxBet ? -1 : 0, auto: false };
    }

    // Initial deal
    const playerInitial = [deck[startIdx], deck[startIdx + 1]];
    const dealerInitial = [deck[startIdx + 2], deck[startIdx + 3]];
    let cardIdx = startIdx + 4;

    if (
        isNaturalBlackjack(playerInitial) &&
        calculateHandValue(dealerInitial) !== 21
    )
        return {
            cardsConsumed: cardIdx - startIdx,
            payout: maxBet ? 1.5 : 0,
            auto: true,
        };

    // Player hits (checking for bust after each card)
    const playerHand = [...playerInitial];
    for (let i = 0; i < playerHits && cardIdx < deck.length; i++) {
        playerHand.push(deck[cardIdx]);
        cardIdx++;

        const playerValue = calculateHandValue(playerHand);
        // Player busts - hand ends immediately, dealer doesn't draw
        if (playerValue > 21) {
            return {
                cardsConsumed: cardIdx - startIdx,
                payout: maxBet ? -1 : 0,
                auto: true,
            };
        }
    }

    // If we couldn't complete all requested hits, not enough cards
    if (playerHand.length !== 2 + playerHits) {
        return { cardsConsumed: 0, payout: maxBet ? -1 : 0, auto: false };
    }

    const playerValue = calculateHandValue(playerHand);

    // Dealer plays
    const dealerHand = [...dealerInitial];
    let dealerValue = calculateHandValue(dealerInitial);

    while (dealerValue <= 16 && cardIdx < deck.length) {
        dealerHand.push(deck[cardIdx]);
        cardIdx++;
        dealerValue = calculateHandValue(dealerHand);
    }

    // If dealer couldn't complete their hand, not enough cards
    if (dealerValue <= 16) {
        return { cardsConsumed: 0, payout: maxBet ? -1 : 0, auto: false };
    }

    const cardsConsumed = cardIdx - startIdx;

    // Determine winner
    if (dealerValue > 21) {
        // Dealer busts, player wins
        return { cardsConsumed, payout: maxBet ? 1 : 0, auto: false };
    }

    if (playerValue > dealerValue) {
        return { cardsConsumed, payout: maxBet ? 1 : 0, auto: false };
    } else if (playerValue < dealerValue) {
        return { cardsConsumed, payout: maxBet ? -1 : 0, auto: false };
    } else {
        // Tie
        return { cardsConsumed, payout: maxBet ? -1 : 0, auto: false };
    }
}

export function calculateOptimalStrategy(
    ns: NS,
    deck: Card[],
): {
    totalValue: number;
    actions: Action[];
} {
    const n = deck.length;
    const dp: Map<number, DPResult> = new Map();

    // Base case: not enough cards left
    for (let i = n - 3; i <= n; i++) {
        dp.set(i, { maxValue: 0, action: { bet: false, hits: 0, stay: true } });
    }

    // Fill DP table backwards
    for (let i = n - 4; i >= 0; i--) {
        let bestValue = -Infinity;
        let bestAction: Action = { bet: false, hits: 0, stay: true };

        // Try all possible number of hits (reasonable upper bound)
        const maxPossibleHits = Math.min(n - i - 4, 10); // 10 is arbitrary but reasonable

        for (let hits = 0; hits <= maxPossibleHits; hits++) {
            // Option 1: Bet 0 and stay (for deck manipulation)
            const sim0 = simulateHand(deck, i, hits, false);
            if (sim0.payout !== 0) throw new Error('?');
            if (sim0.cardsConsumed > 0) {
                const nextIdx = i + sim0.cardsConsumed;
                const futureValue = dp.get(nextIdx)?.maxValue ?? 0;
                const totalValue = sim0.payout + futureValue;

                if (totalValue > bestValue) {
                    bestValue = totalValue;
                    bestAction = { bet: false, hits, stay: !sim0.auto }; // TODO FIX ME
                }
            }

            // Option 2: Bet max and try to win
            const simMax = simulateHand(deck, i, hits, true);
            if (simMax.cardsConsumed > 0) {
                const nextIdx = i + simMax.cardsConsumed;
                const futureValue = dp.get(nextIdx)?.maxValue ?? 0;
                const totalValue = simMax.payout + futureValue;

                if (totalValue > bestValue) {
                    if (simMax.payout < 1) throw new Error('?');
                    bestValue = totalValue;
                    bestAction = { bet: true, hits, stay: !simMax.auto }; // TODO FIX ME
                }
            }
        }

        dp.set(i, { maxValue: bestValue, action: bestAction });
    }

    // Reconstruct the sequence of actions
    const actions: Action[] = [];
    let currentIdx = 0;

    while (currentIdx < n - 3) {
        const result = dp.get(currentIdx);
        if (!result) break;

        actions.push(result.action);

        // Simulate to find next index
        const sim = simulateHand(
            deck,
            currentIdx,
            result.action.hits,
            result.action.bet,
        );
        if (currentIdx < 100)
            ns.print(
                `IHand: ${deck.slice(currentIdx, currentIdx + 2)}: ${JSON.stringify(result.action)} -> ${JSON.stringify(sim)}`,
            );
        if (sim.cardsConsumed === 0) break;

        currentIdx += sim.cardsConsumed;
    }

    return {
        totalValue: dp.get(0)?.maxValue ?? 0,
        actions,
    };
}

// ============================================================================
// BETTING FUNCTION – YOU MUST IMPLEMENT THIS
// ============================================================================
async function getDeck(ns: NS, doc: Document): Promise<any> {
    let element = (await getByXpath(ns, doc, "//button[contains(.,'Start')]"))!;

    ns.print(`Tag: ${element.nodeName}`);
    ns.print(`Tag: ${element.nodeType}`);
    ns.print(`Tag: ${element.nodeValue}`);
    ns.print(`Tag: ${element.textContent}`);

    let fiberKey = Object.keys(element).find((key) =>
        key.startsWith('__reactFiber'),
    );

    // @ts-ignore
    let fiber = element[fiberKey];

    let deck = fiber.return.return.return.return.return.stateNode.deck;

    return deck;
}

async function playRound(ns: NS, doc: Document, action: Action) {
    await setText(
        ns,
        await getByXpath(ns, doc, "//input[@type='number']"),
        `${action.bet ? WIN_BET : LOSE_BET}`,
    );

    await click(ns, await getByXpath(ns, doc, `//button[contains(.,'Start')]`));

    for (let i = 0; i < action.hits; i++) {
        await click(
            ns,
            await getByXpath(ns, doc, `//button[contains(.,'Hit')]`),
        );
    }

    if (action.stay)
        await click(
            ns,
            await getByXpath(ns, doc, `//button[contains(.,'Stay')]`),
        );
}

async function click(ns: NS, button: Node | null) {
    if (!button) throw new Error('Only send click confirmed to exist buttons');

    if (DEBUG_MODE) {
        ns.print(`Tag: ${button.nodeName}`);
        ns.print(`Tag: ${button.nodeType}`);
        ns.print(`Tag: ${button.nodeValue}`);
        ns.print(`Tag: ${button.textContent}`);
    }

    await ns.sleep(10);

    let fnOnClick =
        button[
            // @ts-ignore
            Object.keys(button).find((key) => key.startsWith('__reactProps'))
        ].onClick;
    //let fnOnClick = button[Object.keys(button)[1]].onClick; // Figure out what I do lamo

    if (!fnOnClick)
        // @ts-ignore
        throw new Error(`${button.text()} missing an onClick method`);

    await fnOnClick({ isTrusted: true }); // We can make it trusted by willing it so!

    await ns.sleep(10);
}

async function setText(ns: NS, input: Node | null, text: string) {
    if (!input)
        throw new Error('Only send setText confirmed to exist textboxes');

    await ns.sleep(10);

    if (DEBUG_MODE) {
        ns.print(`Tag: ${input.nodeName}`);
        ns.print(`Tag: ${input.nodeType}`);
        ns.print(`Tag: ${input.nodeValue}`);
        ns.print(`Tag: ${input.textContent}`);
    }

    // @ts-ignore
    let fnOnChange =
        input[
            // @ts-ignore
            Object.keys(input).find((key) => key.startsWith('__reactProps'))
        ].onChange;

    if (!fnOnChange)
        // @ts-ignore
        throw new Error(`${input.text()} missing an onChange method`);

    //ns.print(text);
    //ns.print({ value: text });
    //ns.print({ isTrusted: true, currentTarget: { value: text } });

    await fnOnChange({ isTrusted: true, currentTarget: { value: text } }); // We can make it trusted by willing it so!

    await ns.sleep(10);
}

async function getByXpath(
    ns: NS,
    doc: Document,
    xpath: string,
): Promise<Node | null> {
    for (let i = 0; i < 10; i++) {
        try {
            return doc.evaluate(
                xpath,
                doc,
                null,
                XPathResult.FIRST_ORDERED_NODE_TYPE,
                null,
            ).singleNodeValue;
        } catch (e) {
            await ns.sleep(5);
        }
    }
    throw new Error(`${xpath} missing from ${doc}`);
}

// ============================================================================
// MAIN Function
// ============================================================================
export async function main(ns: NS) {
    let doc: Document = eval('document');

    if (ns.getPlayer().city !== 'Aevum') throw new Error('Get into Aevum rat');

    //ns.singularity.goToLocation("Iker Molina Casino")
    await click(
        ns,
        await getByXpath(
            ns,
            doc,
            "//div[(@role = 'button') and (contains(., 'City'))]",
        ),
    );

    await click(
        ns,
        await getByXpath(ns, doc, "//span[@aria-label = 'Iker Molina Casino']"),
    );

    await click(
        ns,
        await getByXpath(ns, doc, "//button[contains(text(), 'blackjack')]"),
    );

    await ns.sleep(1_000);

    if (DEBUG_MODE) {
        ns.print(doc);
        ns.print(doc.evaluate);
        let result = doc.evaluate(
            "//div[(@role = 'button') and (contains(., 'City'))]",
            doc,
            null,
            XPathResult.FIRST_ORDERED_NODE_TYPE,
            null,
        );
        let node = result.singleNodeValue;

        if (node) {
            ns.print(`Tag: ${node.nodeName}`);
            ns.print(`Tag: ${node.nodeType}`);
            ns.print(`Tag: ${node.nodeValue}`);
            ns.print(`Tag: ${node.textContent}`);
            ns.print(
                // @ts-ignore
                `Data: ${node[Object.keys(node).find((key) => key.startsWith('__reactProps'))].onClick}`,
            );
            // @ts-ignore
        }
    }

    await ns.sleep(500);

    const deck = await getDeck(ns, doc);

    // @ts-ignore
    const cards = deck.cards.map((c) => c.value);
    ns.print(cards);

    const optimalStrategy = calculateOptimalStrategy(ns, cards);
    //ns.print(optimalStrategy.actions);
    ns.print(`For: ${optimalStrategy.totalValue}`);

    ns.print(simulateHand([4, 10, 9, 10, 6, 6, 6, 7, 5], 0, 0, true));

    return;
}
