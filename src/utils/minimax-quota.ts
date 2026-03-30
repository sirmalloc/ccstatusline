import * as https from 'https';
import * as os from 'os';
import * as path from 'path';

export interface MiniMaxQuotaData {
    intervalRemaining: number;
    intervalTotal: number;
    weeklyRemaining: number;
    weeklyTotal: number;
}

interface MiniMaxApiResponse {
    model_remains?: Array<{
        model_name?: string;
        current_interval_total_count?: number;
        current_interval_usage_count?: number;
        current_weekly_total_count?: number;
        current_weekly_usage_count?: number;
    }>;
}

// Cache configuration
const CACHE_DIR = path.join(os.homedir(), '.cache', 'ccstatusline');
const CACHE_FILE = path.join(CACHE_DIR, 'minimax-quota.json');
const CACHE_MAX_AGE = 60; // seconds

function ensureCacheDirExists(): void {
    if (!fs.existsSync(CACHE_DIR)) {
        fs.mkdirSync(CACHE_DIR, { recursive: true });
    }
}

function getMiniMaxApiKey(): string | null {
    // Check ANTHROPIC_AUTH_TOKEN first (commonly used)
    const token = process.env.ANTHROPIC_AUTH_TOKEN;
    if (token) return token;
    
    // Check MINIMAX_API_KEY
    const minimaxKey = process.env.MINIMAX_API_KEY;
    if (minimaxKey) return minimaxKey;
    
    // Check MINI_MAX_API_KEY (various naming conventions)
    const miniMaxKey = process.env.MINI_MAX_API_KEY;
    if (miniMaxKey) return miniMaxKey;
    
    return null;
}

function parseMiniMaxApiResponse(body: string): MiniMaxQuotaData | null {
    try {
        const data: MiniMaxApiResponse = JSON.parse(body);
        
        if (!data.model_remains) return null;
        
        // Find MiniMax-M model
        const miniMaxModel = data.model_remains.find(m => 
            m.model_name && m.model_name.includes('MiniMax-M')
        );
        
        if (!miniMaxModel) return null;
        
        const intervalTotal = miniMaxModel.current_interval_total_count ?? 0;
        const intervalUsage = miniMaxModel.current_interval_usage_count ?? 0;
        const weeklyTotal = miniMaxModel.current_weekly_total_count ?? 0;
        const weeklyUsage = miniMaxModel.current_weekly_usage_count ?? 0;
        
        // current_interval_usage_count is actually the REMAINING count (counterintuitive)
        // API returns remaining, not used
        const intervalRemaining = intervalUsage;
        const weeklyRemaining = weeklyUsage;
        
        return {
            intervalRemaining,
            intervalTotal,
            weeklyRemaining,
            weeklyTotal
        };
    } catch {
        return null;
    }
}

function readCache(): MiniMaxQuotaData | null {
    try {
        const fs = require('fs');
        const data = fs.readFileSync(CACHE_FILE, 'utf8');
        const parsed = JSON.parse(data);
        return parsed as MiniMaxQuotaData;
    } catch {
        return null;
    }
}

function writeCache(data: MiniMaxQuotaData): void {
    try {
        const fs = require('fs');
        ensureCacheDirExists();
        fs.writeFileSync(CACHE_FILE, JSON.stringify(data));
    } catch {
        // Ignore cache write errors
    }
}

async function fetchFromMiniMaxApi(apiKey: string): Promise<MiniMaxQuotaData | null> {
    return new Promise((resolve) => {
        const options = {
            hostname: 'api.minimax.io',
            path: '/v1/api/openplatform/coding_plan/remains',
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            timeout: 5000
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.setEncoding('utf8');
            
            res.on('data', (chunk: string) => {
                data += chunk;
            });
            
            res.on('end', () => {
                if (res.statusCode === 200 && data) {
                    const parsed = parseMiniMaxApiResponse(data);
                    resolve(parsed);
                } else {
                    resolve(null);
                }
            });
        });

        req.on('error', () => resolve(null));
        req.on('timeout', () => {
            req.destroy();
            resolve(null);
        });
        
        req.end();
    });
}

export async function fetchMiniMaxQuota(): Promise<MiniMaxQuotaData | null> {
    const fs = require('fs');
    
    // Check cache first
    try {
        if (fs.existsSync(CACHE_FILE)) {
            const stat = fs.statSync(CACHE_FILE);
            const fileAge = Math.floor(Date.now() / 1000) - Math.floor(stat.mtimeMs / 1000);
            if (fileAge < CACHE_MAX_AGE) {
                const cached = readCache();
                if (cached) return cached;
            }
        }
    } catch {
        // Continue to API call
    }
    
    // Get API key
    const apiKey = getMiniMaxApiKey();
    if (!apiKey) {
        return null;
    }
    
    // Fetch from API
    const data = await fetchFromMiniMaxApi(apiKey);
    if (data) {
        writeCache(data);
    }
    
    return data;
}

// Export fs for readCache/writeCache functions that use it
import * as fs from 'fs';
