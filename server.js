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

// File upload for music recognition
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: parseInt(process.env.MAX_AUDIO_SIZE) || 10485760 },
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('audio/')) {
            cb(null, true);
        } else {
            cb(new Error('Only audio files are allowed'));
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
                // Extract response from different possible structures
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
// ELEVENLABS VOICE SERVICE
// ============================================
class ElevenLabsService {
    static async generateSpeech(text) {
        try {
            if (!process.env.ELEVENLABS_API_KEY) {
                throw new Error('ElevenLabs API key not configured');
            }
            
            const response = await axios.post(
                `https://api.elevenlabs.io/v1/text-to-speech/${process.env.ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM'}`,
                {
                    text: text,
                    model_id: "eleven_monolingual_v1",
                    voice_settings: {
                        stability: 0.5,
                        similarity_boost: 0.75
                    }
                },
                {
                    headers: {
                        'xi-api-key': process.env.ELEVENLABS_API_KEY,
                        'Content-Type': 'application/json'
                    },
                    responseType: 'arraybuffer',
                    timeout: 30000
                }
            );
            
            return {
                success: true,
                audio: Buffer.from(response.data).toString('base64'),
                format: 'audio/mpeg'
            };
        } catch (error) {
            console.error('ElevenLabs Error:', error.message);
            return {
                success: false,
                error: 'Voice generation failed'
            };
        }
    }
}

// ============================================
// ACRCLOUD MUSIC RECOGNITION (SHAZAM-STYLE)
// ============================================
class MusicRecognitionService {
    static async identifySong(audioBuffer, mimeType) {
        try {
            if (!process.env.ACRCLOUD_ACCESS_KEY || !process.env.ACRCLOUD_SECRET_KEY) {
                throw new Error('ACRCloud credentials not configured');
            }
            
            const form = new FormData();
            form.append('sample', audioBuffer, {
                filename: `audio_${Date.now()}.${mimeType.split('/')[1] || 'webm'}`,
                contentType: mimeType
            });
            
            const response = await axios.post(
                `https://${process.env.ACRCLOUD_HOST || 'identify-eu-west-1.acrcloud.com'}/v1/identify`,
                form,
                {
                    headers: {
                        ...form.getHeaders(),
                        'access-key': process.env.ACRCLOUD_ACCESS_KEY
                    },
                    auth: {
                        username: process.env.ACRCLOUD_ACCESS_KEY,
                        password: process.env.ACRCLOUD_SECRET_KEY
                    },
                    timeout: 15000
                }
            );
            
            if (response.data.status.code === 0 && response.data.metadata?.music?.[0]) {
                const music = response.data.metadata.music[0];
                return {
                    success: true,
                    song: {
                        title: music.title,
                        artist: music.artists?.map(a => a.name).join(', ') || 'Unknown Artist',
                        album: music.album?.name || 'Unknown Album',
                        duration: music.duration_ms,
                        label: music.label
                    }
                };
            }
            
            return {
                success: false,
                error: 'Song not recognized'
            };
        } catch (error) {
            console.error('Music Recognition Error:', error.message);
            return {
                success: false,
                error: 'Recognition service unavailable'
            };
        }
    }
}

// ============================================
// YOUTUBE DOWNLOAD ORCHESTRATION
// ============================================
class YouTubeDownloadService {
    static async downloadMP3(youtubeUrl) {
        try {
            const encodedUrl = encodeURIComponent(youtubeUrl);
            const apiUrl = `https://api.giftedtech.co.ke/api/download/ytmp3?apikey=gifted&url=${encodedUrl}&quality=128`;
            
            const response = await axios.get(apiUrl, {
                timeout: 30000,
                headers: { 'Accept': 'application/json' }
            });
            
            return {
                success: true,
                data: response.data
            };
        } catch (error) {
            console.error('YouTube MP3 Download Error:', error.message);
            return {
                success: false,
                error: 'Download failed'
            };
        }
    }
    
    static async downloadMP4(youtubeUrl) {
        try {
            const encodedUrl = encodeURIComponent(youtubeUrl);
            const apiUrl = `https://api.giftedtech.co.ke/api/download/ytmp4?apikey=gifted&url=${encodedUrl}&quality=720`;
            
            const response = await axios.get(apiUrl, {
                timeout: 30000,
                headers: { 'Accept': 'application/json' }
            });
            
            return {
                success: true,
                data: response.data
            };
        } catch (error) {
            console.error('YouTube MP4 Download Error:', error.message);
            return {
                success: false,
                error: 'Download failed'
            };
        }
    }
    
    static async directMP3(youtubeUrl) {
        try {
            const encodedUrl = encodeURIComponent(youtubeUrl);
            const apiUrl = `https://api.giftedtech.co.ke/api/download/dlmp3?apikey=gifted&url=${encodedUrl}`;
            
            const response = await axios.get(apiUrl, {
                timeout: 30000,
                headers: { 'Accept': 'application/json' }
            });
            
            return {
                success: true,
                data: response.data
            };
        } catch (error) {
            console.error('Direct MP3 Download Error:', error.message);
            return {
                success: false,
                error: 'Download failed'
            };
        }
    }
}

// ============================================
// INTENT CLASSIFIER
// ============================================
class IntentClassifier {
    static classify(text) {
        const lowerText = text.toLowerCase();
        
        // Check for identity questions first
        if (/(who.*created.*bera|who.*owns.*bera|who.*made.*you|who.*is.*your.*creator)/i.test(text)) {
            return 'identity';
        }
        
        if (/(download|convert|get|save).*(youtube|video|audio|mp3|mp4)/i.test(lowerText) || 
            /(yt|youtu\.be|youtube\.com)/.test(lowerText)) {
            return 'download';
        }
        
        if (/(what.*song|identify.*song|shazam|recognize.*music|name.*this.*track)/i.test(lowerText)) {
            return 'music_recognition';
        }
        
        if (/(create.*music|make.*song|generate.*track|compose.*music)/i.test(lowerText)) {
            return 'music_generation';
        }
        
        if (/(help|support|guide|what.*can.*you.*do)/i.test(lowerText)) {
            return 'help';
        }
        
        return 'general';
    }
}

// ============================================
// API ENDPOINTS
// ============================================

// Health check
app.get('/api/health', (req, res) => {
    res.json({
        status: 'online',
        system: 'Bera AI',
        creator: 'Bruce Bera',
        timestamp: new Date().toISOString(),
        features: {
            ai_conversation: 'active',
            voice_synthesis: process.env.ELEVENLABS_API_KEY ? 'active' : 'inactive',
            music_recognition: process.env.ACRCLOUD_ACCESS_KEY ? 'active' : 'inactive',
            youtube_download: 'active'
        }
    });
});

// Main Bera AI endpoint
app.post('/api/bera-ai', async (req, res) => {
    try {
        const { message, voice = false } = req.body;
        
        if (!message) {
            return res.json({
                success: false,
                error: 'Message is required',
                creator: 'Bruce Bera'
            });
        }
        
        const intent = IntentClassifier.classify(message);
        let response;
        
        // Handle identity questions
        if (intent === 'identity') {
            response = {
                type: 'identity',
                message: 'Bera AI was created, developed, and is exclusively owned by Bruce Bera. Third-party services are tools I use, but Bruce Bera is my sole creator and owner.',
                creator: 'Bruce Bera'
            };
        }
        // Handle download requests
        else if (intent === 'download') {
            const urlMatch = message.match(/(https?:\/\/[^\s]+)/);
            if (urlMatch) {
                response = {
                    type: 'download',
                    message: `I can help download that YouTube video. Use the download endpoints.`,
                    url: urlMatch[0],
                    endpoints: {
                        mp3: '/api/download/youtube-mp3',
                        mp4: '/api/download/youtube-mp4',
                        direct_mp3: '/api/download/direct-mp3'
                    },
                    creator: 'Bruce Bera'
                };
            } else {
                response = {
                    type: 'download',
                    message: 'Send me a YouTube URL to download as MP3 or MP4.',
                    creator: 'Bruce Bera'
                };
            }
        }
        // Handle music recognition requests
        else if (intent === 'music_recognition') {
            response = {
                type: 'music_recognition',
                message: 'Upload an audio file to /api/music/identify and I will identify the song for you.',
                endpoint: '/api/music/identify',
                max_size: '10MB',
                formats: ['mp3', 'wav', 'm4a', 'webm'],
                creator: 'Bruce Bera'
            };
        }
        // Handle music generation
        else if (intent === 'music_generation') {
            const genres = ['electronic', 'ambient', 'cinematic', 'lo-fi', 'synthwave', 'orchestral'];
            const moods = ['uplifting', 'melancholic', 'energetic', 'calm', 'mysterious', 'hopeful'];
            const genre = genres[Math.floor(Math.random() * genres.length)];
            const mood = moods[Math.floor(Math.random() * moods.length)];
            
            response = {
                type: 'music_generation',
                message: `I'll create a ${mood} ${genre} track for you. This will be an original composition.`,
                specifications: {
                    genre: genre,
                    mood: mood,
                    tempo: `${Math.floor(Math.random() * 60) + 80} BPM`,
                    structure: 'Intro - Verse - Chorus - Bridge - Outro',
                    copyright_safe: true
                },
                creator: 'Bruce Bera'
            };
        }
        // Handle help requests
        else if (intent === 'help') {
            response = {
                type: 'help',
                message: 'I am Bera AI, created by Bruce Bera. I can help with: AI conversations, YouTube downloads, song identification, music generation, and voice synthesis.',
                capabilities: [
                    'AI Conversations (GiftedTech GPT-4o)',
                    'YouTube Download (MP3/MP4)',
                    'Music Recognition (Shazam-style)',
                    'Music Generation',
                    'Voice Synthesis (ElevenLabs)'
                ],
                creator: 'Bruce Bera'
            };
        }
        // General conversation - use GiftedTech AI
        else {
            const aiResponse = await GiftedAIService.getAIResponse(message);
            response = {
                type: 'ai_response',
                message: aiResponse || 'I am Bera AI, created by Bruce Bera. How can I help you?',
                ai_provider: 'GiftedTech GPT-4o',
                creator: 'Bruce Bera'
            };
        }
        
        // Add voice if requested
        if (voice === true) {
            const voiceResult = await ElevenLabsService.generateSpeech(response.message);
            if (voiceResult.success) {
                response.voice = {
                    audio: voiceResult.audio,
                    format: voiceResult.format
                };
            }
        }
        
        res.json({
            success: true,
            response: response,
            system: 'Bera AI',
            creator: 'Bruce Bera',
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('Bera AI Error:', error);
        res.json({
            success: false,
            error: 'System error',
            creator: 'Bruce Bera'
        });
    }
});

// Download endpoints
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
            error: 'Download failed',
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
            error: 'Download failed',
            creator: 'Bruce Bera'
        });
    }
});

app.post('/api/download/direct-mp3', async (req, res) => {
    try {
        const { url } = req.body;
        if (!url) {
            return res.json({
                success: false,
                error: 'YouTube URL required',
                creator: 'Bruce Bera'
            });
        }
        
        const result = await YouTubeDownloadService.directMP3(url);
        res.json({
            ...result,
            system: 'Bera AI',
            creator: 'Bruce Bera'
        });
    } catch (error) {
        res.json({
            success: false,
            error: 'Download failed',
            creator: 'Bruce Bera'
        });
    }
});

// Music recognition endpoint
app.post('/api/music/identify', upload.single('audio'), async (req, res) => {
    try {
        if (!req.file) {
            return res.json({
                success: false,
                error: 'Audio file required',
                creator: 'Bruce Bera'
            });
        }
        
        const result = await MusicRecognitionService.identifySong(
            req.file.buffer,
            req.file.mimetype
        );
        
        res.json({
            ...result,
            system: 'Bera AI',
            creator: 'Bruce Bera'
        });
    } catch (error) {
        res.json({
            success: false,
            error: 'Recognition failed',
            creator: 'Bruce Bera'
        });
    }
});

// Voice generation endpoint
app.post('/api/voice/generate', async (req, res) => {
    try {
        const { text } = req.body;
        if (!text) {
            return res.json({
                success: false,
                error: 'Text required',
                creator: 'Bruce Bera'
            });
        }
        
        const result = await ElevenLabsService.generateSpeech(text);
        res.json({
            ...result,
            system: 'Bera AI',
            creator: 'Bruce Bera'
        });
    } catch (error) {
        res.json({
            success: false,
            error: 'Voice generation failed',
            creator: 'Bruce Bera'
        });
    }
});

// Admin endpoint
app.post('/api/admin/status', (req, res) => {
    if (req.headers['x-admin-token'] !== process.env.ADMIN_TOKEN) {
        return res.json({
            success: false,
            error: 'Unauthorized',
            creator: 'Bruce Bera'
        });
    }
    
    res.json({
        success: true,
        status: 'operational',
        creator: 'Bruce Bera',
        system: 'Bera AI',
        uptime: process.uptime(),
        services: {
            gifted_ai: 'active',
            youtube_download: 'active',
            music_recognition: process.env.ACRCLOUD_ACCESS_KEY ? 'active' : 'inactive',
            voice_synthesis: process.env.ELEVENLABS_API_KEY ? 'active' : 'inactive'
        }
    });
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

Features Active:
${process.env.ELEVENLABS_API_KEY ? '✓ Voice Synthesis (ElevenLabs)' : '✗ Voice Synthesis (Not configured)'}
${process.env.ACRCLOUD_ACCESS_KEY ? '✓ Music Recognition (ACRCloud)' : '✗ Music Recognition (Not configured)'}
✓ AI Conversations (GiftedTech GPT-4o)
✓ YouTube Downloads (MP3/MP4)

System: Bera AI
Creator: Bruce Bera
    `);
});
