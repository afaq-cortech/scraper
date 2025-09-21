const GoogleScraper = require("../utils/googleScraper");
const UrlFilter = require("../utils/urlFilter");
const WebsiteContentScraper = require("../utils/websiteContentScraper");
const LeadExtractor = require("../utils/leadExtractor");
const DataProcessor = require("../utils/dataProcessor");
const config = require("../config");
const fs = require("fs");
const path = require("path");

class LeadScraper {
	constructor() {
		this.googleScraper = new GoogleScraper();
		this.urlFilter = new UrlFilter();
		this.websiteContentScraper = null; // Will be initialized with context
		this.leadExtractor = new LeadExtractor();
		this.dataProcessor = new DataProcessor();

		this.leads = [];
		this.isRunning = false;
	}

	async scrapeLeads(keywords, leadsPerKeyword = 50) {
		if (this.isRunning) {
			throw new Error("Scraper is already running");
		}

		this.isRunning = true;
		console.log(`🚀 Starting Lead Scraper for ${keywords.length} keywords`);

		try {
			await this.googleScraper.initialize();

			// Initialize website content scraper with the context from Google scraper
			this.websiteContentScraper = new WebsiteContentScraper(
				this.googleScraper.context
			);

			const timestamp = new Date().toISOString();
			this.dataProcessor.initializeBackup(`leads_${timestamp}`, "enhanced");

			let totalLeads = 0;
			let totalUrlsFound = 0;

			for (let i = 0; i < keywords.length; i++) {
				const keyword = keywords[i];
				console.log(
					`\n🔍 Processing keyword ${i + 1}/${keywords.length}: "${keyword}"`
				);

				try {
					console.log(`🔍 Searching Google for all results...`);
					const searchResults = await this.googleScraper.searchGoogle(
						keyword,
						leadsPerKeyword
					);

					if (searchResults.length === 0) {
						console.log(`⚠️ No search results for: "${keyword}"`);
						continue;
					}

					console.log(`📊 Found ${searchResults.length} Google search results`);
					totalUrlsFound += searchResults.length;

					// Show history information if enabled
					if (config.HISTORY?.ENABLED && searchResults.length === 0) {
						console.log(`⚠️ No new URLs found for "${keyword}" - all URLs may have been previously scraped`);
						console.log(`💡 Consider using a different keyword or clearing history for this keyword`);
					}
					// console.log("original urls list:", searchResults);

					// console.log(`🧠 Filtering websites with LLM...`);
					// const filteredWebsites = await this.urlFilter.filterUrls(
					// 	searchResults,
					// 	keyword
					// );
					// console.log(
					// 	`✅ Filtered to ${filteredWebsites.length} relevant websites`
					// );

					console.log(`🌐 Scraping websites with Playwright...`);
					const scrapedResults =
						await this.websiteContentScraper.scrapeWebsites(
							searchResults.map((result) => ({
								url: result.url,
								title: result.title,
								snippet: result.snippet,
								keyword: keyword,
							}))
						);

					console.log(`🧠 Extracting data with LLM...`);
					const extractedData = await this.leadExtractor.extractLeads(
						scrapedResults,
						keyword
					);

				console.log(`📝 Processing leads...`);
				const keywordLeads = this.createLeadsFromData(extractedData, keyword);

				// Save leads
				keywordLeads.forEach((lead) => {
					this.dataProcessor.appendLeadToBackup(lead);
					this.leads.push(lead);
					totalLeads++;
				});

				console.log(
					`✅ Keyword "${keyword}": ${keywordLeads.length} leads found`
				);

				// Export leads for this keyword separately
				if (keywordLeads.length > 0) {
					const processedKeywordLeads = this.dataProcessor.processLeads(keywordLeads);
					const safeKeyword = keyword.toLowerCase().replace(/[^a-z0-9]/g, '_');
					const keywordExportPath = this.dataProcessor.exportData(
						processedKeywordLeads,
						`scraped_leads_${safeKeyword}`,
						config.OUTPUT_FORMAT
					);
					console.log(`📊 Keyword export: ${keywordExportPath}`);
				}

					// Delay between keywords
					if (i < keywords.length - 1) {
						await new Promise((resolve) =>
							setTimeout(resolve, config.DELAY_BETWEEN_REQUESTS)
						);
					}
				} catch (error) {
					console.error(
						`❌ Error processing keyword "${keyword}":`,
						error.message
					);
					continue;
				}
			}

			// Export data
			this.dataProcessor.closeBackup(totalLeads);

		if (this.leads.length > 0) {
			const processedLeads = this.dataProcessor.processLeads(this.leads);
			const exportPath = this.dataProcessor.exportData(
				processedLeads,
				"scraped_leads_combined",
				config.OUTPUT_FORMAT
			);
			console.log(`📊 Combined export (all keywords): ${exportPath}`);
		}

			console.log(`\n🎉 Scraping completed! Total leads: ${totalLeads}`);
			return this.leads;
		} catch (error) {
			console.error("❌ Scraping failed:", error);
			throw error;
		} finally {
			await this.googleScraper.close();
			this.isRunning = false;
		}
	}

	createLeadsFromData(extractedData, keyword) {
		const leads = [];

		for (const leadData of extractedData) {
			if (!leadData) {
				continue;
			}

			// Create lead object with only 5 required fields
			const lead = {
				name: leadData.name || "",
				title: leadData.title || "",
				company: leadData.company || "",
				email: leadData.email || "",
				phone: leadData.phone || "",
			};

			leads.push(lead);
		}

		console.log(`📝 Created ${leads.length} leads from extracted data`);
		return leads;
	}

	getStats() {
		return {
			totalLeads: this.leads.length,
			leadsWithName: this.leads.filter((l) => l.name).length,
			leadsWithTitle: this.leads.filter((l) => l.title).length,
			leadsWithCompany: this.leads.filter((l) => l.company).length,
			leadsWithEmail: this.leads.filter((l) => l.email).length,
			leadsWithPhone: this.leads.filter((l) => l.phone).length,
			uniqueCompanies: new Set(this.leads.map((l) => l.company)).size,
			isRunning: this.isRunning,
		};
	}

	reset() {
		this.leads = [];
		this.dataProcessor.reset();
		this.isRunning = false;
		console.log("🔄 Scraper reset");
	}

	async stop() {
		if (this.isRunning) {
			console.log("🛑 Stopping scraper...");
			this.isRunning = false;
			await this.googleScraper.close();
		}
	}
}

module.exports = LeadScraper;
