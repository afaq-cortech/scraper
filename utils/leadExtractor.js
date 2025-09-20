const { GoogleGenerativeAI } = require("@google/generative-ai");
const config = require("../config");
require("dotenv").config();

class LeadExtractor {
	constructor() {
		this.apiKey = config.LLM.API_KEY;
		this.genAI = this.apiKey ? new GoogleGenerativeAI(this.apiKey) : null;
		this.model = this.genAI
			? this.genAI.getGenerativeModel({ model: config.LLM.MODEL })
			: null;
	}

	async extractLeads(websiteData, keyword) {
		if (!this.genAI) {
			console.log("No Gemini API key available, using basic extraction");
			return this.extractBasicLeads(websiteData);
		}

		console.log(
			`Extracting leads from ${websiteData.length} websites for keyword: "${keyword}"`
		);

		const results = [];

		for (const data of websiteData) {
			try {
				const leads = await this.extractLeadsFromWebsite(data, keyword);
				results.push(...leads);

				// Add delay between extractions to respect rate limits
				await this.delay(1000);
			} catch (error) {
				console.error(`Failed to extract leads from ${data.url}:`, error);
				// Continue with next website
			}
		}

		console.log(`Lead extraction completed: ${results.length} leads found`);
		return results;
	}

	async extractLeadsFromWebsite(websiteData, keyword) {
		const content = websiteData.content || "";
		const wordCount = this.countWords(content);

		// If content is small, process normally
		if (wordCount <= 10000) {
			return await this.processSingleBatch(websiteData, keyword, content);
		}

		// For large content, split into batches and maintain context
		return await this.processLargeContent(websiteData, keyword, content);
	}

	async processSingleBatch(websiteData, keyword, content) {
		const prompt = this.buildExtractionPrompt(websiteData, keyword, content);

		try {
			const result = await this.model.generateContent(prompt);
			const response = await result.response.text();
			return this.parseExtractionResponse(response, websiteData);
		} catch (error) {
			console.error("Gemini extraction error:", error);
			return this.extractBasicLeads([websiteData]);
		}
	}

	async processLargeContent(websiteData, keyword, content) {
		const batches = this.splitContentIntoBatches(content, 10000);
		let contextSummary = "";
		let allLeads = [];

		for (let i = 0; i < batches.length; i++) {
			const batch = batches[i];
			const isLastBatch = i === batches.length - 1;

			try {
				const result = await this.processBatchWithContext(
					websiteData,
					keyword,
					batch,
					contextSummary,
					isLastBatch
				);

				const { leads, newContextSummary } = this.parseBatchResponse(
					result,
					websiteData
				);
				allLeads.push(...leads);
				contextSummary = newContextSummary;

				if (!isLastBatch) {
					await this.delay(1000);
				}
			} catch (error) {
				console.error(`Batch ${i + 1} processing failed:`, error);
			}
		}

		return allLeads;
	}

	async processBatchWithContext(
		websiteData,
		keyword,
		batchContent,
		contextSummary,
		isLastBatch
	) {
		const prompt = this.buildBatchExtractionPrompt(
			websiteData,
			keyword,
			batchContent,
			contextSummary,
			isLastBatch
		);

		const result = await this.model.generateContent(prompt);
		return await result.response.text();
	}

	buildExtractionPrompt(websiteData, keyword, content) {
		const processedContent = content
			? content.substring(0, 50000)
			: websiteData.content.substring(0, 50000);

		return `Extract business lead information from this website content.

KEYWORD: "${keyword}"
URL: "${websiteData.url}"

CONTENT:
${processedContent}

Extract ONLY the following 5 fields in JSON format:
{
  "leads": [
    {
      "name": "Full name of the individual",
      "title": "Job title or professional designation",
      "company": "Current organization or employer",
      "email": "Email address",
      "phone": "Contact number (mobile or office)"
    }
  ]
}

Rules:
- Extract ONLY the 5 required fields: name, title, company, email, phone
- Include multiple contacts if found (CEO, manager, sales, etc.)
- Only extract clearly visible contact information
- Don't infer or guess missing data
- Format phone numbers consistently
- If no relevant information found, return empty leads array
- Do NOT include website, address, or any other fields

Respond in valid JSON format only.`;
	}

	buildBatchExtractionPrompt(
		websiteData,
		keyword,
		batchContent,
		contextSummary,
		isLastBatch
	) {
		const contextSection = contextSummary
			? `\nPREVIOUS CONTEXT:\n${contextSummary}\n`
			: "";

		return `Extract business lead information from this website content.

KEYWORD: "${keyword}"
URL: "${websiteData.url}"
${contextSection}
CURRENT CONTENT:
${batchContent}

Extract ONLY the following 5 fields in JSON format:
{
  "leads": [
    {
      "name": "Full name of the individual",
      "title": "Job title or professional designation",
      "company": "Current organization or employer",
      "email": "Email address",
      "phone": "Contact number (mobile or office)"
    }
  ],
  "context_summary": "Brief summary of key business information found"
}

Rules:
- Extract ONLY the 5 required fields: name, title, company, email, phone
- Include multiple contacts if found (CEO, manager, sales, etc.)
- Only extract clearly visible contact information
- Don't infer or guess missing data
- Format phone numbers consistently
- If no relevant information found, return empty leads array
- Do NOT include website, address, or any other fields
- Provide context summary for next batch

Respond in valid JSON format only.`;
	}

	parseExtractionResponse(response, websiteData) {
		try {
			const cleanResponse = response.replace(/```json|```/g, "").trim();
			const parsed = JSON.parse(cleanResponse);

			if (!parsed.leads || !Array.isArray(parsed.leads)) {
				throw new Error("Invalid response format");
			}

			return parsed.leads.map((lead) => ({
				...lead,
				sourceUrl: websiteData.url,
				extractedAt: new Date().toISOString(),
				keyword: websiteData.keyword || "unknown",
			}));
		} catch (error) {
			console.error("Failed to parse extraction response:", error);
			return this.extractBasicLeads([websiteData]);
		}
	}

	parseBatchResponse(response, websiteData) {
		try {
			const cleanResponse = response.replace(/```json|```/g, "").trim();
			const parsed = JSON.parse(cleanResponse);

			if (!parsed.leads || !Array.isArray(parsed.leads)) {
				throw new Error("Invalid response format");
			}

			const leads = parsed.leads.map((lead) => ({
				...lead,
				sourceUrl: websiteData.url,
				extractedAt: new Date().toISOString(),
				keyword: websiteData.keyword || "unknown",
			}));

			return {
				leads,
				newContextSummary: parsed.context_summary || "",
			};
		} catch (error) {
			console.error("Failed to parse batch response:", error);
			return {
				leads: this.extractBasicLeads([websiteData]),
				newContextSummary: "",
			};
		}
	}

	countWords(text) {
		if (!text) return 0;
		return text
			.trim()
			.split(/\s+/)
			.filter((word) => word.length > 0).length;
	}

	splitContentIntoBatches(content, maxWords) {
		const words = content.split(/\s+/);
		const batches = [];

		for (let i = 0; i < words.length; i += maxWords) {
			const batchWords = words.slice(i, i + maxWords);
			batches.push(batchWords.join(" "));
		}

		return batches;
	}

	extractBasicLeads(websiteDataArray) {
		const leads = [];

		for (const data of websiteDataArray) {
			const content = data.content || "";

			// Basic regex patterns
			const emailRegex = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g;
			const phoneRegex =
				/(\+?1?[-.\s]?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4})/g;

			const emails = content.match(emailRegex) || [];
			const phones = content.match(phoneRegex) || [];

			// Clean and validate
			const cleanEmails = emails.filter(
				(email) =>
					!email.includes("example.") &&
					!email.includes("test@") &&
					!email.includes("noreply")
			);

			const cleanPhones = phones.filter((phone) => {
				const digits = phone.replace(/\D/g, "");
				return digits.length >= 10 && digits.length <= 15;
			});

			if (cleanEmails.length > 0 || cleanPhones.length > 0) {
				leads.push({
					name: "",
					title: "",
					company: this.extractCompanyName(content),
					email: cleanEmails[0] || "",
					phone: cleanPhones[0] || "",
					sourceUrl: data.url,
					extractedAt: new Date().toISOString(),
					keyword: data.keyword || "unknown",
				});
			}
		}

		return leads;
	}

	extractCompanyName(content) {
		// Simple company name extraction
		const lines = content.split("\n").slice(0, 10); // First 10 lines
		for (const line of lines) {
			const trimmed = line.trim();
			if (
				trimmed.length > 5 &&
				trimmed.length < 100 &&
				!trimmed.includes("@") &&
				!trimmed.match(/\d{3}[-.\s]?\d{3}[-.\s]?\d{4}/)
			) {
				return trimmed;
			}
		}
		return "";
	}

	delay(ms) {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}

	isAvailable() {
		return !!this.genAI;
	}
}

module.exports = LeadExtractor;
