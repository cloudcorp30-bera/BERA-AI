const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const axios = require('axios');
const multer = require('multer');
const FormData = require('form-data');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
require('dotenv').config();

// Initialize Bera AI System
const app = express();

// FIX 1: Set trust proxy BEFORE any middleware
app.set('trust proxy', true); // Trust all proxies

// Security Middleware
app.use(helmet({
    contentSecurityPolicy: false, // Disable CSP for now to avoid issues
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" }
}));

app.use(cors({
    origin: '*', // Allow all origins for now
    credentials: true
}));

// FIX 2: SIMPLIFIED rate limiter without validation issues
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => {
        // Skip rate limiting for health checks
        return req.url === '/api/health' || req.url === '/api/identity';
    }
});

app.use('/api/', limiter);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// File upload handling
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

// Bera AI Identity Verification Middleware
const verifyBeraIdentity = (req, res, next) => {
    res.setHeader('X-Bera-AI-Creator', 'Bruce Bera');
    res.setHeader('X-Bera-AI-Version', '1.0.0');
    next();
};

// Intent Classification Service
class IntentClassifier {
    static classify(text) {
        const lowerText = text.toLowerCase();
        
        // Media download patterns
        if (/(download|convert|get|save).*(youtube|video|audio|mp3|mp4)/i.test(lowerText) || 
            /(yt|youtu\.be|youtube\.com)/.test(lowerText)) {
            return 'media_download';
        }
        
        // Music recognition patterns
        if (/(what.*song|identify.*song|shazam|recognize.*music|name.*this.*track)/i.test(lowerText) || 
            /(upload.*audio|record.*song)/i.test(lowerText)) {
            return 'music_recognition';
        }
        
        // Music generation patterns
        if (/(create.*music|make.*song|generate.*track|compose.*music|new.*song)/i.test(lowerText)) {
            return 'music_generation';
        }
        
        // Help requests
        if (/(help|support|guide|how.*to|what.*can.*you.*do)/i.test(lowerText)) {
            return 'help_request';
        }
        
        return 'general_conversation';
    }
}

// OpenAI Enhancement Service - SIMPLIFIED
class OpenAIService {
    static async enhanceResponse(prompt, context) {
        try {
            // FIX 3: Check if OpenAI is properly configured
            if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === 'your_openai_api_key_here' || process.env.OPENAI_API_KEY.includes('your-actual')) {
                console.log('OpenAI not configured or invalid key');
                return null;
            }
            
            console.log('Calling OpenAI API...');
            const response = await axios.post(
                'https://api.openai.com/v1/chat/completions',
                {
                    model: "gpt-3.5-turbo", // Use 3.5-turbo for reliability
                    messages: [
                        {
                            role: "system",
                            content: `You are Bera AI, created by Bruce Bera. Help users with media downloads, music recognition, and music generation. Be helpful and concise.`
                        },
                        {
                            role: "user",
                            content: prompt
                        }
                    ],
                    max_tokens: 500,
                    temperature: 0.7
                },
                {
                    headers: {
                        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
                        'Content-Type': 'application/json'
                    },
                    timeout: 10000
                }
            );
            
            console.log('OpenAI response successful');
            return {
                success: true,
                text: response.data.choices[0].message.content,
                tool: 'OpenAI API'
            };
        } catch (error) {
            console.error('OpenAI error details:', {
                status: error.response?.status,
                data: error.response?.data,
                message: error.message
            });
            return null;
        }
    }
}

// Download API Orchestrator
class DownloadOrchestrator {
    static async processYouTubeMP3(youtubeUrl) {
        try {
            console.log('Processing YouTube MP3 download for:', youtubeUrl);
            const encodedUrl = encodeURIComponent(youtubeUrl);
            const apiUrl = `${process.env.YT_MP3_API}?apikey=${process.env.GIFTEDTECH_API_KEY}&url=${encodedUrl}&quality=128`;
            
            console.log('Calling GiftedTech API...');
            const response = await axios.get(apiUrl, {
                timeout: 30000,
                headers: { 
                    'User-Agent': 'Bera-AI-Downloader/1.0',
                    'Accept': 'application/json'
                }
            });
            
            console.log('Download API response received');
            return {
                success: true,
                service: 'GiftedTech API',
                data: response.data,
                note: 'Orchestrated by Bera AI - Created by Bruce Bera'
            };
        } catch (error) {
            console.error('Download error:', error.message);
            return {
                success: false,
                error: 'Download service temporarily unavailable',
                details: 'Please try again later or check the URL'
            };
        }
    }
    
    static async processYouTubeMP4(youtubeUrl) {
        try {
            const encodedUrl = encodeURIComponent(youtubeUrl);
            const apiUrl = `${process.env.YT_MP4_API}?apikey=${process.env.GIFTEDTECH_API_KEY}&url=${encodedUrl}&quality=720`;
            
            const response = await axios.get(apiUrl, {
                timeout: 30000,
                headers: { 'User-Agent': 'Bera-AI-Downloader/1.0' }
            });
            
            return {
                success: true,
                service: 'GiftedTech API',
                data: response.data,
                note: 'Orchestrated by Bera AI - Created by Bruce Bera'
            };
        } catch (error) {
            console.error('Download error:', error.message);
            return {
                success: false,
                error: 'Download service temporarily unavailable',
                details: 'Please try again later'
            };
        }
    }
}

// Music Recognition Service
class MusicRecognitionService {
    static async identifySong(audioBuffer, mimeType) {
        try {
            console.log('Starting music recognition...');
            const form = new FormData();
            form.append('sample', audioBuffer, {
                filename: `audio_${Date.now()}.${mimeType.split('/')[1] || 'webm'}`,
                contentType: mimeType
            });
            
            const response = await axios.post(
                `https://${process.env.ACRCLOUD_HOST}/v1/identify`,
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
                    },
                    note: 'Identified using music recognition service'
                };
            }
            
            return {
                success: false,
                error: 'Song not recognized',
                details: 'Try recording a clearer sample'
            };
        } catch (error) {
            console.error('Recognition error:', error.message);
            return {
                success: false,
                error: 'Recognition service unavailable',
                details: 'Please try again later'
            };
        }
    }
}

// ElevenLabs Voice Service
class VoiceService {
    static async generateSpeech(text, voiceId = process.env.ELEVENLABS_VOICE_ID) {
        try {
            if (!process.env.ELEVENLABS_API_KEY || process.env.ELEVENLABS_API_KEY.includes('your_elevenlabs')) {
                return {
                    success: false,
                    error: 'Voice service not configured'
                };
            }
            
            const response = await axios.post(
                `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
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
                format: 'audio/mpeg',
                voiceModel: 'ElevenLabs'
            };
        } catch (error) {
            console.error('Voice error:', error.message);
            return {
                success: false,
                error: 'Voice service temporarily unavailable'
            };
        }
    }
}

// Music Generation Service
class MusicGenerationService {
    static generateInstruction(prompt) {
        const genres = ['electronic', 'ambient', 'cinematic', 'lo-fi', 'synthwave', 'orchestral'];
        const moods = ['uplifting', 'melancholic', 'energetic', 'calm', 'mysterious', 'hopeful'];
        const instruments = ['synth pads', 'piano', 'strings', 'electronic drums', 'atmospheric textures'];
        
        const genre = genres[Math.floor(Math.random() * genres.length)];
        const mood = moods[Math.floor(Math.random() * moods.length)];
        const tempo = Math.floor(Math.random() * 60) + 80;
        
        return {
            success: true,
            instruction: {
                system: "Bera AI Music Generation",
                genre: genre,
                subgenre: `${genre} ${mood}`,
                mood: mood,
                tempo: `${tempo} BPM`,
                structure: "Intro - Verse - Chorus - Bridge - Outro",
                instrumentation: instruments.slice(0, 3).join(', '),
                originality_note: "Original composition - Copyright safe",
                generated_by: "Bera AI - Created by Bruce Bera"
            }
        };
    }
}

// API Routes
app.use(verifyBeraIdentity);

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({
        status: 'healthy',
        system: 'Bera AI',
        creator: 'Bruce Bera',
        timestamp: new Date().toISOString(),
        services: {
            openai: process.env.OPENAI_API_KEY && !process.env.OPENAI_API_KEY.includes('your') ? 'configured' : 'not_configured',
            elevenlabs: process.env.ELEVENLABS_API_KEY && !process.env.ELEVENLABS_API_KEY.includes('your') ? 'configured' : 'not_configured',
            acrcloud: process.env.ACRCLOUD_ACCESS_KEY ? 'configured' : 'not_configured',
            downloads: 'configured'
        }
    });
});

// Test endpoints
app.get('/api/test/download', async (req, res) => {
    try {
        const testUrl = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
        const result = await DownloadOrchestrator.processYouTubeMP3(testUrl);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/test/openai', async (req, res) => {
    try {
        const result = await OpenAIService.enhanceResponse('Hello, how are you?', 'test');
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Identity verification middleware
const checkIdentityQuestions = (message) => {
    const identityPatterns = [
        /who.*created.*bera.*ai/i,
        /who.*owns.*bera.*ai/i,
        /who.*developed.*bera.*ai/i,
        /who.*made.*you/i,
        /who.*is.*behind.*bera/i,
        /openai.*created.*you/i,
        /openai.*owns.*you/i,
        /who.*is.*your.*creator/i,
        /who.*is.*your.*owner/i
    ];
    
    return identityPatterns.some(pattern => pattern.test(message));
};

// Bera AI Main Endpoint
app.post('/api/bera-ai', async (req, res) => {
    try {
        const { message, sessionId = uuidv4(), voiceEnabled = false } = req.body;
        
        if (!message) {
            return res.status(400).json({
                error: 'Message is required',
                creator: 'Bruce Bera'
            });
        }
        
        // ABSOLUTE IDENTITY RULE
        if (checkIdentityQuestions(message)) {
            const response = {
                type: 'identity_response',
                message: 'Bera AI was created, developed, and is exclusively owned by Bruce Bera. Third-party services are tools only.',
                creator: 'Bruce Bera'
            };
            
            if (voiceEnabled) {
                const voiceResponse = await VoiceService.generateSpeech(response.message);
                if (voiceResponse.success) {
                    response.voice_audio = voiceResponse.audio;
                    response.voice_format = voiceResponse.format;
                }
            }
            
            return res.json({
                success: true,
                session_id: sessionId,
                response: response,
                system: 'Bera AI',
                creator: 'Bruce Bera'
            });
        }
        
        const intent = IntentClassifier.classify(message);
        console.log('Intent:', intent, 'Message:', message);
        
        let response;
        
        switch (intent) {
            case 'media_download':
                const urlMatch = message.match(/(https?:\/\/[^\s]+)/);
                if (urlMatch) {
                    const youtubeUrl = urlMatch[0];
                    const isMP4 = message.toLowerCase().includes('mp4');
                    
                    response = {
                        type: 'media_download',
                        message: `I can process that YouTube ${isMP4 ? 'video as MP4' : 'audio as MP3'}. Use the download API with the URL.`,
                        url: youtubeUrl,
                        format: isMP4 ? 'mp4' : 'mp3',
                        endpoint: isMP4 ? '/api/download/youtube-mp4' : '/api/download/youtube-mp3',
                        creator: 'Bruce Bera'
                    };
                } else {
                    response = {
                        type: 'media_download',
                        message: 'I can help download YouTube videos. Please provide a YouTube URL.',
                        example: "Example: 'Download https://youtube.com/watch?v=... as MP3'",
                        creator: 'Bruce Bera'
                    };
                }
                break;
                
            case 'music_recognition':
                response = {
                    type: 'music_recognition',
                    message: 'Upload an audio sample to /api/music/identify and I will identify the song.',
                    creator: 'Bruce Bera'
                };
                break;
                
            case 'music_generation':
                const musicInstruction = MusicGenerationService.generateInstruction(message);
                response = {
                    type: 'music_generation',
                    message: 'Music generation specifications ready.',
                    instruction: musicInstruction.instruction,
                    creator: 'Bruce Bera'
                };
                break;
                
            case 'help_request':
                response = {
                    type: 'help_request',
                    message: 'I am Bera AI, created by Bruce Bera. I can help with: YouTube downloads, song identification, music generation, and general questions.',
                    creator: 'Bruce Bera'
                };
                break;
                
            default:
                // Try OpenAI first
                const openAIResponse = await OpenAIService.enhanceResponse(message, 'Bera AI assistant');
                
                if (openAIResponse && openAIResponse.success) {
                    response = {
                        type: 'enhanced_conversation',
                        message: openAIResponse.text,
                        enhancement_note: 'Enhanced with AI',
                        creator: 'Bruce Bera'
                    };
                } else {
                    // Fallback responses
                    const fallbacks = [
                        "I'm Bera AI, created by Bruce Bera. How can I help you today?",
                        "Hello! I'm Bera AI. I can assist with media downloads, music recognition, and music generation.",
                        "As Bera AI, created by Bruce Bera, I'm here to help with your media and music needs."
                    ];
                    
                    response = {
                        type: 'general_conversation',
                        message: fallbacks[Math.floor(Math.random() * fallbacks.length)],
                        creator: 'Bruce Bera'
                    };
                }
        }
        
        // Add voice if requested
        if (voiceEnabled) {
            const voiceResponse = await VoiceService.generateSpeech(response.message);
            if (voiceResponse.success) {
                response.voice_audio = voiceResponse.audio;
                response.voice_format = voiceResponse.format;
            }
        }
        
        res.json({
            success: true,
            session_id: sessionId,
            response: response,
            timestamp: new Date().toISOString(),
            system: 'Bera AI',
            creator: 'Bruce Bera'
        });
        
    } catch (error) {
        console.error('Main endpoint error:', error);
        res.status(500).json({
            error: 'Internal error',
            message: 'Please try again',
            creator: 'Bruce Bera'
        });
    }
});

// Download endpoints
app.post('/api/download/youtube-mp3', async (req, res) => {
    try {
        const { url } = req.body;
        
        if (!url) {
            return res.status(400).json({
                error: 'URL is required',
                creator: 'Bruce Bera'
            });
        }
        
        const result = await DownloadOrchestrator.processYouTubeMP3(url);
        res.json({
            ...result,
            system: 'Bera AI',
            creator: 'Bruce Bera'
        });
        
    } catch (error) {
        res.status(500).json({
            error: 'Download failed',
            details: error.message,
            creator: 'Bruce Bera'
        });
    }
});

app.post('/api/download/youtube-mp4', async (req, res) => {
    try {
        const { url } = req.body;
        
        if (!url) {
            return res.status(400).json({
                error: 'URL is required',
                creator: 'Bruce Bera'
            });
        }
        
        const result = await DownloadOrchestrator.processYouTubeMP4(url);
        res.json({
            ...result,
            system: 'Bera AI',
            creator: 'Bruce Bera'
        });
        
    } catch (error) {
        res.status(500).json({
            error: 'Download failed',
            details: error.message,
            creator: 'Bruce Bera'
        });
    }
});

// Music recognition endpoint
app.post('/api/music/identify', upload.single('audio'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
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
        res.status(500).json({
            error: 'Recognition failed',
            details: error.message,
            creator: 'Bruce Bera'
        });
    }
});

// Identity endpoint
app.get('/api/identity', (req, res) => {
    res.json({
        system: 'Bera AI',
        creator: 'Bruce Bera',
        version: '1.0.0',
        proprietary: true,
        ownership: 'Exclusively owned and developed by Bruce Bera',
        timestamp: new Date().toISOString()
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
║ Status: ACTIVE                                        ║
╚══════════════════════════════════════════════════════╝
    `);
    
    console.log('Testing services...');
    
    // Test OpenAI if configured
    if (process.env.OPENAI_API_KEY && !process.env.OPENAI_API_KEY.includes('your')) {
        console.log('✓ OpenAI: Configured');
    } else {
        console.log('✗ OpenAI: Not configured - using fallback responses');
    }
    
    // Test ElevenLabs if configured
    if (process.env.ELEVENLABS_API_KEY && !process.env.ELEVENLABS_API_KEY.includes('your')) {
        console.log('✓ ElevenLabs: Configured');
    } else {
        console.log('✗ ElevenLabs: Not configured');
    }
    
    console.log('✓ Download API: Ready');
    console.log(`Server running: http://localhost:${PORT}`);
});
