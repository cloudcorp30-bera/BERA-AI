const express = require('express');
const cors = require('cors');
const axios = require('axios');
const multer = require('multer');
const FormData = require('form-data');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: parseInt(process.env.MAX_AUDIO_SIZE) || 10485760 },
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('audio/') || file.mimetype.startsWith('video/')) {
            cb(null, true);
        } else {
            cb(new Error('Only audio/video files are allowed'));
        }
    }
});

// ============================================
// GIFTEDTECH AI SERVICE
// ============================================
class GiftedAIService {
    static async getAIResponse(prompt) {
        try {
            const encodedPrompt = encodeURIComponent(prompt);
            const apiUrl = `https://api.giftedtech.co.ke/api/ai/gpt4o?apikey=gifted&q=${encodedPrompt}`;
            
            const response = await axios.get(apiUrl, {
                timeout: 30000,
                headers: { 'Accept': 'application/json' }
            });
            
            if (response.data) {
                if (typeof response.data === 'string') {
                    return response.data;
                } else if (response.data.result) {
                    return response.data.result;
                } else if (response.data.response) {
                    return response.data.response;
                } else if (response.data.message) {
                    return response.data.message;
                } else {
                    return JSON.stringify(response.data);
                }
            }
            return null;
        } catch (error) {
            console.error('GiftedTech AI Error:', error.message);
            return null;
        }
    }
}

// ============================================
// YOUTUBE SEARCH SERVICE
// ============================================
class YouTubeSearchService {
    static async searchSong(songQuery) {
        try {
            console.log('Searching YouTube for:', songQuery);
            
            // Clean the query
            const cleanQuery = songQuery.replace(/download|get|song|music|track|audio/gi, '').trim();
            const searchQuery = cleanQuery + " official audio";
            const encodedQuery = encodeURIComponent(searchQuery);
            
            // Try GiftedTech search API first
            try {
                const searchUrl = `https://api.giftedtech.co.ke/api/search/youtube?apikey=gifted&q=${encodedQuery}&limit=3`;
                
                const response = await axios.get(searchUrl, {
                    timeout: 15000,
                    headers: { 'Accept': 'application/json' }
                });
                
                if (response.data && response.data.videos && response.data.videos.length > 0) {
                    const video = response.data.videos[0];
                    return {
                        success: true,
                        title: video.title,
                        videoId: video.id,
                        url: `https://www.youtube.com/watch?v=${video.id}`,
                        thumbnail: video.thumbnail,
                        duration: video.duration
                    };
                }
            } catch (searchError) {
                console.log('GiftedTech search failed, using fallback');
            }
            
            // Fallback: Construct YouTube search URL
            return {
                success: true,
                title: songQuery,
                url: `https://www.youtube.com/results?search_query=${encodeURIComponent(songQuery)}`,
                note: 'Search results - select video manually'
            };
            
        } catch (error) {
            console.error('YouTube Search Error:', error.message);
            return {
                success: false,
                error: 'Search service unavailable'
            };
        }
    }
}

// ============================================
// YOUTUBE DOWNLOAD SERVICE - AUTO MP3 DEFAULT
// ============================================
class YouTubeDownloadService {
    static async downloadMP3(youtubeUrl) {
        try {
            console.log('Downloading MP3:', youtubeUrl);
            
            // Check if it's a search URL (results page)
            if (youtubeUrl.includes('/results?')) {
                return {
                    success: false,
                    error: 'Please provide a direct YouTube video URL, not a search page.',
                    note: 'Go to YouTube, find the video, and copy the URL from the address bar'
                };
            }
            
            const encodedUrl = encodeURIComponent(youtubeUrl);
            const apiUrl = `https://api.giftedtech.co.ke/api/download/ytmp3?apikey=gifted&url=${encodedUrl}&quality=128`;
            
            const response = await axios.get(apiUrl, {
                timeout: 60000,
                headers: { 'Accept': 'application/json' }
            });
            
            console.log('Download API response:', response.data);
            
            // Extract download link
            let downloadLink = '';
            let title = 'YouTube Audio';
            
            if (response.data) {
                // Try different response formats
                if (response.data.download_link) {
                    downloadLink = response.data.download_link;
                } else if (response.data.url) {
                    downloadLink = response.data.url;
                } else if (response.data.link) {
                    downloadLink = response.data.link;
                } else if (typeof response.data === 'string' && response.data.includes('http')) {
                    downloadLink = response.data;
                } else if (response.data.data && response.data.data.download_link) {
                    downloadLink = response.data.data.download_link;
                }
                
                if (response.data.title) {
                    title = response.data.title;
                } else if (response.data.data && response.data.data.title) {
                    title = response.data.data.title;
                }
            }
            
            if (!downloadLink) {
                // If no direct link, use the API response as fallback
                return {
                    success: true,
                    raw_data: response.data,
                    title: title,
                    format: 'MP3',
                    quality: '128kbps',
                    note: 'Download data received - process manually',
                    creator: 'Bruce Bera'
                };
            }
            
            return {
                success: true,
                download_link: downloadLink,
                title: title,
                format: 'MP3',
                quality: '128kbps',
                note: 'Click to download',
                creator: 'Bruce Bera'
            };
            
        } catch (error) {
            console.error('MP3 Download Error:', error.message);
            return {
                success: false,
                error: 'MP3 download failed. The service might be temporarily unavailable.',
                creator: 'Bruce Bera'
            };
        }
    }
    
    static async downloadMP4(youtubeUrl) {
        try {
            const encodedUrl = encodeURIComponent(youtubeUrl);
            const apiUrl = `https://api.giftedtech.co.ke/api/download/ytmp4?apikey=gifted&url=${encodedUrl}&quality=720`;
            
            const response = await axios.get(apiUrl, {
                timeout: 60000,
                headers: { 'Accept': 'application/json' }
            });
            
            let downloadLink = '';
            let title = 'YouTube Video';
            
            if (response.data) {
                if (response.data.download_link) {
                    downloadLink = response.data.download_link;
                } else if (response.data.url) {
                    downloadLink = response.data.url;
                } else if (response.data.link) {
                    downloadLink = response.data.link;
                }
                
                if (response.data.title) {
                    title = response.data.title;
                }
            }
            
            return {
                success: true,
                download_link: downloadLink || youtubeUrl,
                title: title,
                format: 'MP4',
                quality: '720p',
                note: 'Click to download',
                creator: 'Bruce Bera'
            };
            
        } catch (error) {
            console.error('MP4 Download Error:', error.message);
            return {
                success: false,
                error: 'MP4 download failed',
                creator: 'Bruce Bera'
            };
        }
    }
}

// ============================================
// INTENT CLASSIFIER - ENHANCED FOR AUTO-DOWNLOAD
// ============================================
class IntentClassifier {
    static classify(text) {
        const lowerText = text.toLowerCase();
        
        // Identity questions
        if (/(who.*created.*bera|who.*owns.*bera|who.*made.*you|who.*is.*your.*creator)/i.test(text)) {
            return 'identity';
        }
        
        // Check for song download requests - MP3 by default
        if (/(download|get|fetch|find).*(song|music|track|audio|mp3|by)/i.test(lowerText) ||
            /(can you.*download|please.*download|i want.*download).*(song|music)/i.test(lowerText)) {
            return 'song_download';
        }
        
        // Check for video download (explicit MP4 request)
        if (/(download|get|save).*(video|mp4|visual)/i.test(lowerText) ||
            /as mp4|as video/i.test(lowerText)) {
            return 'video_download';
        }
        
        // Check for URL downloads
        if (/(youtube\.com|youtu\.be)/.test(lowerText)) {
            return 'url_download';
        }
        
        // Music recognition
        if (/(what.*song|identify.*song|shazam|recognize.*music|name.*this.*track)/i.test(lowerText)) {
            return 'music_recognition';
        }
        
        // Help
        if (/(help|support|guide|what.*can.*you.*do)/i.test(lowerText)) {
            return 'help';
        }
        
        return 'general';
    }
    
    static extractSongRequest(text) {
        const lowerText = text.toLowerCase();
        
        // Remove common phrases
        let cleanText = text.replace(/download|get|fetch|find|song|music|track|audio|please|can you|could you/gi, '').trim();
        cleanText = cleanText.replace(/as mp3|as mp4|as video/gi, '').trim();
        
        // Remove quotes
        cleanText = cleanText.replace(/["']/g, '').trim();
        
        return cleanText || null;
    }
    
    static getDownloadFormat(text) {
        const lowerText = text.toLowerCase();
        
        // If user explicitly asks for video/MP4
        if (/(mp4|video|visual)/.test(lowerText) && !/(mp3|audio)/.test(lowerText)) {
            return 'MP4';
        }
        
        // Default to MP3 for all song downloads
        return 'MP3';
    }
}

// ============================================
// MAIN BERA AI ENDPOINT - AUTO-DOWNLOAD FIXED
// ============================================
app.post('/api/bera-ai', async (req, res) => {
    try {
        const { message } = req.body;
        
        if (!message) {
            return res.json({
                success: false,
                error: 'Message is required',
                creator: 'Bruce Bera'
            });
        }
        
        console.log('Processing:', message);
        const intent = IntentClassifier.classify(message);
        console.log('Intent:', intent);
        
        // Handle song download requests - AUTO PROCESS
        if (intent === 'song_download') {
            const songRequest = IntentClassifier.extractSongRequest(message);
            const format = IntentClassifier.getDownloadFormat(message);
            
            console.log('Song request:', songRequest, 'Format:', format);
            
            if (songRequest) {
                // Search for the song
                const searchResult = await YouTubeSearchService.searchSong(songRequest);
                
                if (searchResult.success && searchResult.url) {
                    // AUTO-DOWNLOAD: Process download immediately
                    let downloadResult;
                    
                    if (format === 'MP4') {
                        downloadResult = await YouTubeDownloadService.downloadMP4(searchResult.url);
                    } else {
                        downloadResult = await YouTubeDownloadService.downloadMP3(searchResult.url);
                    }
                    
                    if (downloadResult.success) {
                        return res.json({
                            success: true,
                            response: {
                                type: 'auto_download',
                                message: `✅ Found "${searchResult.title}" and started ${format} download.`,
                                song: searchResult.title,
                                format: format,
                                download_data: downloadResult,
                                creator: 'Bruce Bera'
                            },
                            system: 'Bera AI',
                            creator: 'Bruce Bera'
                        });
                    } else {
                        return res.json({
                            success: true,
                            response: {
                                type: 'download_failed',
                                message: `Found "${searchResult.title}" but download failed: ${downloadResult.error}`,
                                song: searchResult.title,
                                youtube_url: searchResult.url,
                                note: 'Try the direct download endpoint with this URL',
                                creator: 'Bruce Bera'
                            },
                            system: 'Bera AI',
                            creator: 'Bruce Bera'
                        });
                    }
                } else {
                    return res.json({
                        success: true,
                        response: {
                            type: 'song_not_found',
                            message: `Could not find "${songRequest}" on YouTube. Try a different search term.`,
                            creator: 'Bruce Bera'
                        },
                        system: 'Bera AI',
                        creator: 'Bruce Bera'
                    });
                }
            }
        }
        
        // Handle video download (explicit MP4 request)
        if (intent === 'video_download') {
            const songRequest = IntentClassifier.extractSongRequest(message);
            
            if (songRequest) {
                const searchResult = await YouTubeSearchService.searchSong(songRequest);
                
                if (searchResult.success && searchResult.url) {
                    return res.json({
                        success: true,
                        response: {
                            type: 'video_download_ready',
                            message: `Found "${searchResult.title}" - ready for MP4 download.`,
                            song: searchResult.title,
                            youtube_url: searchResult.url,
                            format: 'MP4',
                            endpoint: '/api/download/youtube-mp4',
                            creator: 'Bruce Bera'
                        },
                        system: 'Bera AI',
                        creator: 'Bruce Bera'
                    });
                }
            }
        }
        
        // Handle URL downloads
        if (intent === 'url_download') {
            const urlMatch = message.match(/(https?:\/\/[^\s]+)/);
            if (urlMatch) {
                const youtubeUrl = urlMatch[0];
                const format = message.toLowerCase().includes('mp4') ? 'MP4' : 'MP3';
                
                return res.json({
                    success: true,
                    response: {
                        type: 'url_download_ready',
                        message: `Ready to download from URL as ${format}.`,
                        url: youtubeUrl,
                        format: format,
                        endpoint: format === 'MP4' ? '/api/download/youtube-mp4' : '/api/download/youtube-mp3',
                        creator: 'Bruce Bera'
                    },
                    system: 'Bera AI',
                    creator: 'Bruce Bera'
                });
            }
        }
        
        // Handle identity questions
        if (intent === 'identity') {
            return res.json({
                success: true,
                response: {
                    type: 'identity',
                    message: 'Bera AI was created, developed, and is exclusively owned by Bruce Bera. Third-party services are tools I use, but Bruce Bera is my sole creator and owner.',
                    creator: 'Bruce Bera'
                },
                system: 'Bera AI',
                creator: 'Bruce Bera'
            });
        }
        
        // Handle music recognition
        if (intent === 'music_recognition') {
            return res.json({
                success: true,
                response: {
                    type: 'music_recognition',
                    message: 'Record or upload an audio sample and I will identify the song for you.',
                    endpoint: '/api/music/identify',
                    creator: 'Bruce Bera'
                },
                system: 'Bera AI',
                creator: 'Bruce Bera'
            });
        }
        
        // Handle help
        if (intent === 'help') {
            return res.json({
                success: true,
                response: {
                    type: 'help',
                    message: 'I am Bera AI, created by Bruce Bera. I can help with:',
                    capabilities: [
                        'Download songs by name (Example: "Download Gleeish Place by King Von") - AUTO MP3',
                        'Download videos by name (Add "as MP4" to request video)',
                        'Identify songs from audio (Shazam-style)',
                        'Download YouTube videos by URL',
                        'AI Conversations'
                    ],
                    creator: 'Bruce Bera'
                },
                system: 'Bera AI',
                creator: 'Bruce Bera'
            });
        }
        
        // General conversation - use GiftedTech AI
        const aiResponse = await GiftedAIService.getAIResponse(message);
        return res.json({
            success: true,
            response: {
                type: 'ai_response',
                message: aiResponse || 'I am Bera AI, created by Bruce Bera. How can I help you?',
                ai_provider: 'GiftedTech GPT-4o',
                creator: 'Bruce Bera'
            },
            system: 'Bera AI',
            creator: 'Bruce Bera'
        });
        
    } catch (error) {
        console.error('Bera AI Error:', error);
        return res.json({
            success: false,
            error: 'System error',
            creator: 'Bruce Bera'
        });
    }
});

// ============================================
// AUTO-DOWNLOAD ENDPOINT (For direct processing)
// ============================================
app.post('/api/download/auto', async (req, res) => {
    try {
        const { song, format = 'MP3' } = req.body;
        
        if (!song) {
            return res.json({
                success: false,
                error: 'Song name required',
                creator: 'Bruce Bera'
            });
        }
        
        console.log('Auto-download request:', song, format);
        
        // Search for the song
        const searchResult = await YouTubeSearchService.searchSong(song);
        
        if (!searchResult.success || !searchResult.url) {
            return res.json({
                success: false,
                error: `Could not find "${song}" on YouTube`,
                creator: 'Bruce Bera'
            });
        }
        
        // Process download
        let downloadResult;
        if (format === 'MP4') {
            downloadResult = await YouTubeDownloadService.downloadMP4(searchResult.url);
        } else {
            downloadResult = await YouTubeDownloadService.downloadMP3(searchResult.url);
        }
        
        return res.json({
            ...downloadResult,
            song: song,
            search_title: searchResult.title,
            format: format,
            system: 'Bera AI',
            creator: 'Bruce Bera'
        });
        
    } catch (error) {
        console.error('Auto-download Error:', error);
        return res.json({
            success: false,
            error: 'Auto-download failed',
            creator: 'Bruce Bera'
        });
    }
});

// ============================================
// EXISTING ENDPOINTS (Keep for compatibility)
// ============================================

// Health check
app.get('/api/health', (req, res) => {
    res.json({
        status: 'online',
        system: 'Bera AI',
        creator: 'Bruce Bera',
        timestamp: new Date().toISOString(),
        features: {
            auto_song_download: 'active',
            ai_conversation: 'active',
            music_recognition: 'active'
        }
    });
});

// YouTube download endpoints
app.post('/api/download/youtube-mp3', async (req, res) => {
    try {
        const { url } = req.body;
        if (!url) {
            return res.json({
                success: false,
                error: 'YouTube URL required',
                creator: 'Bruce Bera'
            });
        }
        
        const result = await YouTubeDownloadService.downloadMP3(url);
        res.json({
            ...result,
            system: 'Bera AI',
            creator: 'Bruce Bera'
        });
    } catch (error) {
        res.json({
            success: false,
            error: 'MP3 download failed',
            creator: 'Bruce Bera'
        });
    }
});

app.post('/api/download/youtube-mp4', async (req, res) => {
    try {
        const { url } = req.body;
        if (!url) {
            return res.json({
                success: false,
                error: 'YouTube URL required',
                creator: 'Bruce Bera'
            });
        }
        
        const result = await YouTubeDownloadService.downloadMP4(url);
        res.json({
            ...result,
            system: 'Bera AI',
            creator: 'Bruce Bera'
        });
    } catch (error) {
        res.json({
            success: false,
            error: 'MP4 download failed',
            creator: 'Bruce Bera'
        });
    }
});

// Serve frontend
app.use(express.static('public'));
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`
╔══════════════════════════════════════════════════════╗
║                 BERA AI SYSTEM ONLINE                ║
╠══════════════════════════════════════════════════════╣
║ Created and Owned by: Bruce Bera                     ║
║ Port: ${PORT}${' '.repeat(46 - PORT.toString().length)}║
╚══════════════════════════════════════════════════════╝

✨ AUTO-DOWNLOAD FEATURE ENABLED ✨
• Say "Download [song name]" → Auto MP3 download
• Add "as MP4" for video download
• No questions asked!

System: Bera AI
Creator: Bruce Bera
    `);
});
