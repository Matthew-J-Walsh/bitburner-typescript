import { NS } from '@ns';
import { LoggingUtility } from '/lib/loggingUtils';

// Minimum amount we will allow investment of
const minimumInvestment = 1e7;
//we punsh stock swaps to prevent fast swapping
const stockSwapPunishment = 1 - 0.03;

interface StockData {
    /** Stock's symbol */
    symbol: string;
    /** Number of shares */
    shares: number;
    /** Number of shares * price (middle one) */
    investment: number;
    /** Effective return on investment (normalized) */
    eROI: number;
    /** +1 if going up, -1 if going down, 0 if we are at exactly 50% forecast */
    direction: number;
}

/**
 * ### StockModule Uniqueness
 * This modules handles the full managment of the stock market
 */
export class StockModule {
    /** Ticks until the last cycle... cycles per tick is 75 */
    private ticksUntilCycle!: number;
    /** Last directions */
    private lastForecasts!: Record<string, number>;
    /** Logger */
    logger!: LoggingUtility;
    /** Current money prohibited from investment */
    public restrictedMoney = 0;
    /** Current total investment */
    private totalInvestment = 0;

    constructor(
        protected ns: NS,
        private getMaximumInvestment: () => number,
    ) {
        this.lastForecasts = Object.fromEntries(
            this.ns.stock
                .getSymbols()
                .map((symbol) => [symbol, this.ns.stock.getForecast(symbol)]),
        );
        this.logger = new LoggingUtility(ns, 'gang', this.log.bind(this));
    }

    manage() {
        this.detectCycle();

        this.logger.logToFile();

        if (!this.ticksUntilCycle) return;

        this.ns.tprint(`Temp debug: ${this.ticksUntilCycle}`);

        const stockData = this.ns.stock
            .getSymbols()
            .map(this.getData)
            .sort((a, b) => b.eROI - a.eROI);

        this.totalInvestment = stockData.reduce(
            (invest, data) => invest + data.investment,
            0,
        );

        let i = stockData.length - 1;
        let j = 0;
        while (i > 1) {
            while (
                this.maxInvestment(stockData[j]) === 0 &&
                j < stockData.length
            )
                j += 1;

            if (this.shouldSwap(stockData[i], stockData[j])) {
                this.sell(stockData[i]);
                this.buy(stockData[j]);
            }

            i -= 1;
        }

        i = 0;
        while (this.liquidity > minimumInvestment) {
            this.buy(stockData[i++]);
        }
    }

    /**
     * Helper function for detecting cycles
     */
    detectCycle() {
        if (this.ticksUntilCycle !== undefined) {
            this.ticksUntilCycle =
                this.ticksUntilCycle === 0 ? 74 : this.ticksUntilCycle - 1;
            return;
        }

        const thisForecasts = Object.fromEntries(
            this.ns.stock
                .getSymbols()
                .map((symbol) => [symbol, this.ns.stock.getForecast(symbol)]),
        );

        const relevantForecasts = Object.entries(thisForecasts).filter(
            ([symbol, forecast]) => Math.abs(0.5 - forecast) > 0.02,
        );

        // if all forecasts are too small, throw a tprint
        if (relevantForecasts.length === 0) {
            this.ns.tprint('Really small forecasts, unable to detect cycles!');
            return;
        }

        let flipped = false;
        relevantForecasts.forEach(([symbol, forecast]) => {
            if (
                (this.lastForecasts[symbol] > 0.5 && forecast < 0.5) ||
                (this.lastForecasts[symbol] < 0.5 && forecast > 0.5)
            ) {
                flipped = true;
            }
        });

        if (flipped) {
            this.ticksUntilCycle = 74;
        } else {
            this.lastForecasts = thisForecasts;
        }
    }

    getData(symbol: string): StockData {
        let [sharesLong, avgLongPrice, sharesShort, avgShortPrice] =
            this.ns.stock.getPosition(symbol);

        const forecast = this.ns.stock.getForecast(symbol);

        if (forecast <= 0.5 && sharesLong) {
            this.ns.stock.sellStock(symbol, sharesLong);
            sharesLong = 0;
        }
        if (forecast >= 0.5 && sharesShort) {
            this.ns.stock.sellStock(symbol, sharesShort);
            sharesShort = 0;
        }
        const shares = Math.max(sharesLong, sharesShort);

        return {
            symbol: symbol,
            shares: shares,
            investment: shares * this.ns.stock.getPrice(symbol),
            eROI: this.expectedROI(symbol),
            direction: forecast === 0.5 ? 0 : forecast > 0.5 ? 1 : -1,
        };
    }

    expectedROI(symbol: string): number {
        const forecast = this.ns.stock.getForecast(symbol);
        if (forecast >= 0.5) {
            const delta =
                (forecast - 0.5) * this.ns.stock.getVolatility(symbol);
            return (
                Math.pow(1 + delta, this.expectedTicksRemaining) *
                    this.getSpread(symbol) -
                1
            );
        } else {
            const delta =
                (0.5 - forecast) * this.ns.stock.getVolatility(symbol);
            return (
                1 -
                Math.pow(1 + delta, this.expectedTicksRemaining) /
                    this.getSpread(symbol)
            );
        }
    }

    shouldSwap(stockA: StockData, stockB: StockData): boolean {
        if (stockA.investment === 0) return false;
        if (stockA.eROI > stockB.eROI) throw new Error('Huh?');
        else return (1 + stockB.eROI) * stockSwapPunishment > 1 + stockA.eROI;
    }

    maxInvestment(stock: StockData): number {
        return (this.ns.stock.getMaxShares(stock.symbol) - stock.shares) *
            stock.direction >=
            0
            ? this.ns.stock.getAskPrice(stock.symbol)
            : this.ns.stock.getBidPrice(stock.symbol);
    }

    getSpread(symbol: string) {
        return (
            this.ns.stock.getBidPrice(symbol) /
            this.ns.stock.getAskPrice(symbol)
        );
    }

    get liquidity(): number {
        return this.ns.getPlayer().money - this.restrictedMoney;
    }

    get expectedTicksRemaining(): number {
        return this.ticksUntilCycle + (75 * 55) / 45;
    }

    buy(stock: StockData) {
        //we always buy everything we can
        if (stock.direction > 0) {
            const shares = Math.floor(
                Math.min(
                    this.liquidity,
                    this.getMaximumInvestment() - this.totalInvestment,
                ) / this.ns.stock.getAskPrice(stock.symbol),
            );
            const price = this.ns.stock.buyStock(stock.symbol, shares);
            stock.investment += price * shares;
            stock.shares = shares;
            this.totalInvestment += price * shares;
        } else if (stock.direction < 0) {
            const shares = Math.floor(
                Math.min(
                    this.liquidity,
                    this.getMaximumInvestment() - this.totalInvestment,
                ) / this.ns.stock.getBidPrice(stock.symbol),
            );
            const price = this.ns.stock.buyShort(stock.symbol, shares);
            stock.investment += price * shares;
            stock.shares = shares;
            this.totalInvestment += price * shares;
        } else {
            throw new Error(`WTF? ${stock}`);
        }
    }

    sell(stock: StockData) {
        if (stock.direction > 0) {
            this.ns.stock.sellStock(stock.symbol, stock.shares);
        } else if (stock.direction < 0) {
            this.ns.stock.sellShort(stock.symbol, stock.shares);
        } else {
            throw new Error(`WTF? ${stock}`);
        }
    }

    get log(): Record<string, any> {
        if (!this.expectedTicksRemaining)
            return { lastForecasts: this.lastForecasts };
        else
            return {
                expectedTicksRemaining: this.expectedTicksRemaining,
                data: this.ns.stock
                    .getSymbols()
                    .map(this.getData)
                    .sort((a, b) => b.eROI - a.eROI),
                restrictedMoney: this.restrictedMoney,
            };
    }
}

/**
 * Btw shorting works by: buying the stock, sell to gain the money back + difference
 * So basically I invest money on the upturn, wait for the downturn, and every downturn i 'gain' money over the stock to reinvest
 *
 * The value of a stock directly at the moment is:
 * .mv aka getVolatility * .ot1kMag aka getForecast * some spread factor * some short vs long factor
 *
 * For manipulation we like stocks that:
 * - Aren't too close to their cap (when they hit their cap they will invert 2nd order forecast,
 *      This is actually the only way we can detect their cap)
 *   * Its actually very hard to detect this as we cannot directly read the second order
 * - Have a high mv
 * - Low spread
 * - Large number of shares (more important later as we get more money)
 * - Easily influenced all that matters is the connected server (every hack gives me .1 so you need 1000 hacks + grows to hit to fully flip a server)
 */
