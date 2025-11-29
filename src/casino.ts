import { NS } from '@ns';
import React from 'react';

// ============================================================================
// CONFIGURATION
// ============================================================================
const MIN_BET = 1;
const MAX_BET = 1e7; // up to casino cap
const DEBUG_MODE = true;

// ============================================================================
// RNG IMPLEMENTATION (WHRNG) — identical to Bitburner implementation
// ============================================================================
function step(values: [number, number, number]): [number, number, number] {
    return [
        (171 * values[0]) % 30269,
        (172 * values[1]) % 30307,
        (170 * values[2]) % 30323,
    ];
}

function nextRandom(values: [number, number, number]): number {
    let nextValues = step(values);
    return Math.floor(
        ((nextValues[0] / 30269 +
            nextValues[1] / 30307 +
            nextValues[2] / 30323) %
            1) *
            37,
    );
}

// ============================================================================
// BETTING FUNCTION – YOU MUST IMPLEMENT THIS
// ============================================================================
async function placeBet(
    ns: NS,
    doc: Document,
    guess: number,
    amount: number,
): Promise<number> {
    await setText(
        ns,
        await getByXpath(ns, doc, "//input[@type='number']"),
        `${amount}`,
    );

    await click(
        ns,
        await getByXpath(ns, doc, `//table//button[text()='${guess}']`),
    );

    await ns.sleep(2100);

    let value: string = (await getByXpath(
        ns,
        doc,
        "(//button[contains(.,'Stop playing')]/following-sibling::h4)[1]",
    ))!.textContent!;

    if (DEBUG_MODE) ns.print(value);

    // Must return the OBSERVED result (0–36)
    return parseInt(value.slice(0, -1));
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
        await getByXpath(ns, doc, "//button[contains(text(), 'roulette')]"),
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

    let element = (await getByXpath(
        ns,
        doc,
        "(//button[contains(.,'Stop playing')]/following-sibling::h4)[1]",
    ))!;

    ns.print(`Tag: ${element.nodeName}`);
    ns.print(`Tag: ${element.nodeType}`);
    ns.print(`Tag: ${element.nodeValue}`);
    ns.print(`Tag: ${element.textContent}`);

    let fiberKey = Object.keys(element).find((key) =>
        key.startsWith('__reactFiber'),
    );

    // @ts-ignore
    let fiber = element[fiberKey];

    /**
     * Ok to explain how to do this:
     * Basically we want to find one of the html elements created, then look at its reactFiber
     * From there we can go up the returns to find an "interesting" memoizedProps
     * In the case of our good friend roulette,
     * we can easily find the s1,s2, and s3 for the random number generator
     *
     * In the case of blackjack, the deck isn't in a useState, so we look at stateNode
     */
    let state = fiber.return.return.return.memoizedState.baseState;
    let values: [number, number, number];
    let guess: number;
    for (let i = 0; i < 1000; i++) {
        if (
            await getByXpath(ns, doc, "//span[contains(.,'Alright cheater')]")
        ) {
            ns.print('YAY WE WIN, GET FUCKED!');
            break;
        }
        values = [state.s1, state.s2, state.s3];
        guess = nextRandom(values);
        ns.print(`Values: ${values}, Guess: ${guess}`);
        await placeBet(ns, doc, guess, MAX_BET);
    }

    return;
}
