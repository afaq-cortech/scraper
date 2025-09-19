const LeadScraper = require("./scrapers/leadScraper");
const config = require("./config");
const fs = require("fs");
const path = require("path");
require('dotenv').config();

class LeadScrapingApp {
	constructor() {
		this.leadScraper = new LeadScraper();
	}

	async runScraper(keywords, leadsPerKeyword = 50) {
		console.log("🚀 Starting Lead Scraper");
		console.log("🔍 Keywords:", keywords.join(", "));
		console.log(`📊 Leads per keyword: ${leadsPerKeyword}`);
		console.log("=".repeat(50));

		try {
			const leads = await this.leadScraper.scrapeLeads(
				keywords,
				leadsPerKeyword
			);
			return leads;
		} catch (error) {
			console.error("❌ Scraping failed:", error);
			throw error;
		}
	}

	showHelp() {
		console.log(`
Lead Scraper - AI-Powered Business Lead Generation

Workflow:
1. 🔍 Get keywords from user
2. 🔍 Search Google for websites using Playwright
3. 🧠 Use AI to filter relevant websites
4. 🌐 Scrape website content directly with Playwright
5. 🧠 Use AI to extract business data from page content
6. 📝 Store extracted leads in Excel/JSON

Usage:
  node index.js [keywords] [leads_per_keyword]
  node index.js file [leads_per_keyword]    # Use keywords from keywords.json
  node index.js config [leads_per_keyword]  # Use keywords from config.js

Arguments:
  keywords              Comma-separated keywords OR "config" OR "file"
  leads_per_keyword     Number of leads to scrape per keyword (default: 50)

Examples:
  node index.js "restaurants New York,pizza delivery Chicago" 25
  node index.js "plumber Miami,dentist Los Angeles" 20
  node index.js file 30
  node index.js config 25

Requirements:
  - GEMINI_API_KEY environment variable for AI functionality
  - Playwright browser automation (no external microservice needed)

Environment Variables:
  GEMINI_API_KEY=your_gemini_api_key       # Required: For AI-powered filtering and extraction

Output:
  Results saved to ./output/ directory
  Excel or JSON format based on config
`);
	}

	loadKeywordsFromFile() {
		const keywordFile = path.join(__dirname, "keywords.json");

		if (!fs.existsSync(keywordFile)) {
			console.log("⚠️ keywords.json file not found. Creating example file...");
			return [];
		}

		try {
			const content = fs.readFileSync(keywordFile, "utf8");
			const data = JSON.parse(content);
			const keywords = Array.isArray(data) ? data : data.keywords || [];

			console.log(`📂 Loaded ${keywords.length} keywords from keywords.json`);
			return keywords;
		} catch (error) {
			console.error("❌ Error reading keywords.json:", error.message);
			return [];
		}
	}

	loadKeywordsFromConfig() {
		const keywords = config.KEYWORDS || [];
		console.log(`⚙️ Loaded ${keywords.length} keywords from config.js`);
		return keywords;
	}

	parseKeywords(keywordInput) {
		if (!keywordInput) {
			console.log(
				"⚠️ No keywords provided. Use 'node index.js help' for usage info."
			);
			return [];
		}

		let keywords = [];

		if (keywordInput.toLowerCase() === "config") {
			keywords = this.loadKeywordsFromConfig();
		} else if (keywordInput.toLowerCase() === "file") {
			keywords = this.loadKeywordsFromFile();
		} else {
			keywords = keywordInput
				.split(",")
				.map((k) => k.trim())
				.filter((k) => k.length > 0);
		}

		if (keywords.length === 0) {
			console.log("❌ No valid keywords found.");
			console.log("💡 Try:");
			console.log(
				'   - Adding keywords to config.js KEYWORDS array and use "config"'
			);
			console.log('   - Adding keywords to keywords.json file and use "file"');
			console.log(
				'   - Providing keywords directly: "restaurant Chicago,plumber Miami"'
			);
			return [];
		}

		console.log(`📝 Using ${keywords.length} keywords:`);
		keywords.forEach((keyword, index) => {
			console.log(`  ${index + 1}. "${keyword}"`);
		});

		return keywords;
	}

	async testPlaywright() {
		try {
			const GoogleScraper = require("./utils/googleScraper");
			const scraper = new GoogleScraper();
			const initialized = await scraper.initialize();

			if (initialized) {
				console.log("✅ Playwright browser automation ready");
				await scraper.close();
				return true;
			} else {
				console.log("❌ Playwright initialization failed");
				return false;
			}
		} catch (error) {
			console.log(`❌ Error testing Playwright: ${error.message}`);
			return false;
		}
	}

	async showSystemStatus() {
		console.log("\n🔍 System Status Check:");

		const UrlFilter = require("./utils/urlFilter");
		const LeadExtractor = require("./utils/leadExtractor");

		const urlFilter = new UrlFilter();
		const leadExtractor = new LeadExtractor();

		console.log(
			`   🧠 AI URL Filter: ${
				urlFilter.isAvailable() ? "✅ Available" : "❌ Not Available"
			}`
		);
		console.log(
			`   🧠 AI Lead Extractor: ${
				leadExtractor.isAvailable() ? "✅ Available" : "❌ Not Available"
			}`
		);

		const playwrightStatus = await this.testPlaywright();
		console.log(
			`   🌐 Playwright Browser: ${
				playwrightStatus ? "✅ Available" : "❌ Not Available"
			}`
		);

		console.log(
			`   🔑 GEMINI_API_KEY: ${
				process.env.GEMINI_API_KEY ? "✅ Set" : "❌ Not Set"
			}`
		);

		if (!process.env.GEMINI_API_KEY) {
			console.log(
				"   💡 Set GEMINI_API_KEY environment variable for AI functionality"
			);
		}

		if (!playwrightStatus) {
			console.log("   💡 Install Playwright browsers: npx playwright install");
		}
	}
}

async function main() {

	let googleAPI = process.env.GEMINI_API_KEY;
	console.log("gemini api key:",googleAPI)

	const app = new LeadScrapingApp();
	const args = process.argv.slice(2);

	if (
		args.length === 0 ||
		args[0] === "help" ||
		args[0] === "--help" ||
		args[0] === "-h"
	) {
		app.showHelp();
		return;
	}

	if (args[0] === "status") {
		await app.showSystemStatus();
		return;
	}

	const keywordInput = args[0];
	const leadsPerKeyword = parseInt(args[1]) || 50;

	if (leadsPerKeyword < 1 || leadsPerKeyword > 100) {
		console.log("❌ Leads per keyword must be between 1 and 100");
		return;
	}

	const keywords = app.parseKeywords(keywordInput);
	if (keywords.length === 0) {
		return;
	}

	console.log(`\n📋 Scraping Configuration:`);
	console.log(`   Keywords: ${keywords.length}`);
	console.log(`   Leads per keyword: ${leadsPerKeyword}`);
	console.log(`   Output format: ${config.OUTPUT_FORMAT.toUpperCase()}`);
	console.log(`   Browser automation: Playwright`);

	try {
		console.log("\n⏳ Starting scraper...");
		const leads = await app.runScraper(keywords, leadsPerKeyword);

		console.log(`\n🎉 Scraping completed successfully!`);
		console.log(`📊 Results:`);
		console.log(`   Data in leads: ${leads.map((l) => console.log("name:", l.name, "email:", l.email, "phone:", l.phone, "company:"))}`);
		console.log(`   Total leads found: ${leads.length}`);
		console.log(`   Leads with email: ${leads.filter((l) => l.email).length}`);
		console.log(`   Leads with phone: ${leads.filter((l) => l.phone).length}`);
		console.log(
			`   Unique companies: ${new Set(leads.map((l) => l.company)).size}`
		);
	} catch (error) {
		console.error("\n❌ Error during scraping:", error.message);
		console.log("\n💡 Troubleshooting tips:");
		console.log("   • Check your internet connection");
		console.log("   • Verify your Gemini API key for AI-powered functionality");
		console.log("   • Install Playwright browsers: npx playwright install");
		console.log("   • Try reducing the number of leads per keyword");
		process.exit(1);
	}
}

process.on("SIGINT", () => {
	console.log("\n⏹️ Gracefully shutting down...");
	console.log("📁 Check ./output/ directory for any partial results");
	process.exit(0);
});

process.on("SIGTERM", () => {
	console.log("\n⏹️ Received termination signal, shutting down...");
	process.exit(0);
});

if (require.main === module) {
	main().catch((error) => {
		console.error("❌ Fatal error:", error);
		process.exit(1);
	});
}

module.exports = LeadScrapingApp;
