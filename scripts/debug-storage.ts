
import "dotenv/config";
import { storage } from "../server/storage";

async function main() {
    console.log("Testing getFinancialMarketScanners...");
    try {
        const data = await storage.getFinancialMarketScanners();
        console.log("Success!");
        console.log("Undervalued count:", data.undervalued.length);
    } catch (error: any) {
        console.error("CRASHED:");
        console.error("Message:", error.message);
        if (error.detail) console.error("Detail:", error.detail);
        if (error.hint) console.error("Hint:", error.hint);
    }
    process.exit(0);
}

main();
