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

// FIX 1: Set trust proxy for rate limiting behind reverse proxy (Render, etc.)
app.set('trust proxy', 1); // Trust first proxy

// Security Middleware
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'", process.env.YT_MP3_API, process.env.YT_MP4_API, process.env.DIRECT_MP3_API, "https://api.elevenlabs.io", `https://${process.env.ACRCLOUD_HOST}`, "https://api.openai.com"]
        }
    }
}));

app.use(cors({
    origin: process.env.NODE_ENV === 'production' ? ['https://bera-ai.onrender.com', 'http://localhost:3000'] : 'http://localhost:3000',
    credentials: true
}));

// FIX 2: Updated rate limiter with proper proxy configuration
const limiter = rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW) * 60 * 1000,
    max: parseInt(process.env.RATE_LIMIT_MAX),
    keyGenerator: (req) => {
        // Use X-Forwarded-For header if behind proxy
        return req.headers['x-forwarded-for'] || req.ip;
    },
    validate: { trustProxy: false } // We handle proxy manually
});

app.use('/api/', limiter);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// File upload handling
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: parseInt(process.env.MAX_AUDIO_SIZE) },
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
    static classify(text, req) {
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
        
        // Admin commands
        if (/(system.*status|admin.*access|developer.*mode|bera.*debug)/i.test(lowerText) && 
            req.headers['x-admin-token'] === process.env.ADMIN_TOKEN) {
            return 'admin_command';
        }
        
        // Help requests
        if (/(help|support|guide|how.*to|what.*can.*you.*do)/i.test(lowerText)) {
            return 'help_request';
        }
        
        return 'general_conversation';
    }
}

// OpenAI Enhancement Service
class OpenAIService {
    static async enhanceResponse(prompt, context) {
        try {
            // FIX 3: Check if OpenAI is properly configured
            if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === 'your_openai_api_key_here') {
                console.log('OpenAI not configured, using fallback response');
                return null;
            }
            
            const response = await axios.post(
                'https://api.openai.com/v1/chat/completions',
                {
                    model: process.env.OPENAI_MODEL || 'gpt-3.5-turbo',
                    messages: [
                        {
                            role: 'system',
                            content: `You are Bera AI, created and owned by Bruce Bera. You help with media downloads, music recognition, and music generation. Be helpful, concise, and professional. Current context: ${context}`
                        },
                        {
                            role: 'user',
                            content: prompt
                        }
                    ],
                    max_tokens: parseInt(process.env.OPENAI_MAX_TOKENS) || 500,
                    temperature: 0.7
                },
                {
                    headers: {
                        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
                        'Content-Type': 'application/json'
                    },
                    timeout: 15000
                }
            );
            
            console.log('OpenAI response successful');
            return {
                success: true,
                text: response.data.choices[0].message.content,
                tool: 'OpenAI API'
            };
        } catch (error) {
            console.error('OpenAI service error:', error.response?.data || error.message);
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
            
            console.log('Calling API:', apiUrl);
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
                details: error.message
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
                details: error.message
            };
        }
    }
    
    static async processDirectMP3(youtubeUrl) {
        try {
            const encodedUrl = encodeURIComponent(youtubeUrl);
            const apiUrl = `${process.env.DIRECT_MP3_API}?apikey=${process.env.GIFTEDTECH_API_KEY}&url=${encodedUrl}`;
            
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
                details: error.message
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
                console.log('Song identified:', music.title);
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
            
            console.log('Song not recognized');
            return {
                success: false,
                error: 'Song not recognized',
                details: 'Try recording a clearer sample or check if the song is in the database'
            };
        } catch (error) {
            console.error('Recognition error:', error.message);
            return {
                success: false,
                error: 'Recognition service unavailable',
                details: error.message
            };
        }
    }
}

// ElevenLabs Voice Service
class VoiceService {
    static async generateSpeech(text, voiceId = process.env.ELEVENLABS_VOICE_ID) {
        try {
            // Check if ElevenLabs is configured
            if (!process.env.ELEVENLABS_API_KEY || process.env.ELEVENLABS_API_KEY === 'your_elevenlabs_api_key_here') {
                console.log('ElevenLabs not configured');
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
                        similarity_boost: 0.75,
                        style: 0.3,
                        use_speaker_boost: true
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
            console.error('Voice generation error:', error.message);
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
                prompt: prompt,
                genre: genre,
                subgenre: `${genre} ${mood}`,
                mood: mood,
                emotional_tone: `${mood} with hints of optimism`,
                tempo: `${tempo} BPM`,
                structure: "Intro (8 bars) - Verse (16 bars) - Chorus (16 bars) - Bridge (8 bars) - Outro (8 bars)",
                instrumentation: instruments.slice(0, 3).join(', '),
                vocal_style: "No vocals (instrumental)",
                language: "Instrumental",
                duration: "3:30",
                key: "C minor",
                originality_note: "This is an original composition. Does not imitate any existing artists or songs.",
                copyright_safe: true,
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
            openai: process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== 'your_openai_api_key_here' ? 'configured' : 'not_configured',
            elevenlabs: process.env.ELEVENLABS_API_KEY && process.env.ELEVENLABS_API_KEY !== 'your_elevenlabs_api_key_here' ? 'configured' : 'not_configured',
            acrcloud: process.env.ACRCLOUD_ACCESS_KEY ? 'configured' : 'not_configured',
            downloads: 'configured'
        }
    });
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
        /who.*is.*your.*owner/i,
        /who.*is.*your.*developer/i,
        /did.*openai.*make.*you/i,
        /are.*you.*from.*openai/i,
        /who.*built.*you/i,
        /who.*programmed.*you/i,
        /who.*is.*your.*maker/i
    ];
    
    return identityPatterns.some(pattern => pattern.test(message));
};

// Bera AI Main Endpoint
app.post('/api/bera-ai', async (req, res) => {
    try {
        console.log('Received request:', req.body.message);
        const { message, sessionId = uuidv4(), voiceEnabled = false } = req.body;
        
        if (!message || typeof message !== 'string') {
            return res.status(400).json({
                error: 'Message is required',
                suggestion: 'Please provide a text message'
            });
        }
        
        // ABSOLUTE IDENTITY RULE ENFORCEMENT
        if (checkIdentityQuestions(message)) {
            const identityResponse = {
                type: 'identity_response',
                message: 'Bera AI was created, developed, and is exclusively owned by Bruce Bera. Third-party services like OpenAI, ElevenLabs, or GiftedTech are tools I use, but they are not my creators or owners. Bruce Bera is the sole creator and owner of Bera AI.',
                absolute_truth: 'Bruce Bera created and owns Bera AI',
                creator: 'Bruce Bera'
            };
            
            // Generate voice if enabled
            let voiceResponse = null;
            if (voiceEnabled) {
                voiceResponse = await VoiceService.generateSpeech(identityResponse.message);
                if (voiceResponse.success) {
                    identityResponse.voice_audio = voiceResponse.audio;
                    identityResponse.voice_format = voiceResponse.format;
                }
            }
            
            return res.json({
                success: true,
                session_id: sessionId,
                response: identityResponse,
                timestamp: new Date().toISOString(),
                system: 'Bera AI',
                creator: 'Bruce Bera',
                identity_rule_enforced: true
            });
        }
        
        const intent = IntentClassifier.classify(message, req);
        console.log('Intent classified as:', intent);
        let response;
        
        switch (intent) {
            case 'media_download':
                // Extract YouTube URL from message
                const urlMatch = message.match(/(https?:\/\/[^\s]+)/);
                if (urlMatch) {
                    const youtubeUrl = urlMatch[0];
                    const isMP4 = message.toLowerCase().includes('mp4') || message.toLowerCase().includes('video');
                    
                    if (isMP4) {
                        response = {
                            type: 'media_download',
                            message: `I'll process that YouTube video as MP4 for you. Processing: ${youtubeUrl}`,
                            action: 'processing_mp4',
                            url: youtubeUrl,
                            creator: 'Bruce Bera'
                        };
                    } else {
                        response = {
                            type: 'media_download',
                            message: `I'll process that YouTube video as MP3 for you. Processing: ${youtubeUrl}`,
                            action: 'processing_mp3',
                            url: youtubeUrl,
                            creator: 'Bruce Bera'
                        };
                    }
                } else {
                    response = {
                        type: 'media_download',
                        message: 'I can help you download media from YouTube. Please provide the specific YouTube URL and specify if you want MP3 or MP4 format.',
                        example: "Example: 'Download https://youtube.com/watch?v=... as MP3'",
                        requires: ['youtube_url', 'format'],
                        creator: 'Bruce Bera'
                    };
                }
                break;
                
            case 'music_recognition':
                response = {
                    type: 'music_recognition',
                    message: 'I can identify songs for you. Please upload or record an audio sample of the song you want to recognize.',
                    requires: 'audio_sample',
                    max_size: '10MB',
                    supported_formats: ['mp3', 'wav', 'm4a', 'webm'],
                    note: 'Uses professional music recognition service',
                    creator: 'Bruce Bera'
                };
                break;
                
            case 'music_generation':
                const musicInstruction = MusicGenerationService.generateInstruction(message);
                response = {
                    type: 'music_generation',
                    message: 'I can help you create original music. Here are the specifications for your requested track:',
                    instruction: musicInstruction.instruction,
                    originality_notice: 'This will be an original composition that does not imitate any existing artists or songs.',
                    next_step: 'Would you like me to proceed with these specifications or adjust any parameters?',
                    creator: 'Bruce Bera'
                };
                break;
                
            case 'admin_command':
                if (req.headers['x-admin-token'] === process.env.ADMIN_TOKEN) {
                    response = {
                        type: 'admin_command',
                        message: 'Admin access granted',
                        system_status: 'Operational',
                        version: '1.0.0',
                        creator: 'Bruce Bera',
                        timestamp: new Date().toISOString()
                    };
                } else {
                    response = {
                        type: 'general_conversation',
                        message: 'I\'m Bera AI, created by Bruce Bera. How can I assist you today?',
                        capabilities: ['Conversation', 'Media Download Orchestration', 'Music Recognition', 'Music Generation Guidance', 'Voice Assistance'],
                        voice_enabled: voiceEnabled
                    };
                }
                break;
                
            case 'help_request':
                response = {
                    type: 'help_request',
                    message: 'I\'m Bera AI, created by Bruce Bera. Here\'s what I can help you with:',
                    capabilities: [
                        'Conversational assistance',
                        'YouTube media download orchestration (MP3/MP4)',
                        'Music identification from audio samples',
                        'Original music generation guidance',
                        'Voice-enabled interaction'
                    ],
                    examples: [
                        "Say: 'Download this YouTube video as MP4: https://youtube.com/watch?v=...'",
                        "Say: 'What song is this?' then upload audio",
                        "Say: 'Create a chill lo-fi track'",
                        "Say: 'Help me with downloads'"
                    ],
                    creator: 'Bruce Bera'
                };
                break;
                
            default:
                // Use OpenAI for general conversation enhancement if available
                console.log('Attempting OpenAI enhancement...');
                const openAIResponse = await OpenAIService.enhanceResponse(
                    message,
                    `I am Bera AI created by Bruce Bera. I help with media downloads, music recognition, and music generation.`
                );
                
                if (openAIResponse && openAIResponse.success) {
                    console.log('Using OpenAI enhanced response');
                    response = {
                        type: 'enhanced_conversation',
                        message: openAIResponse.text,
                        enhancement_note: 'Response enhanced using AI tools',
                        tool_used: openAIResponse.tool,
                        creator: 'Bruce Bera'
                    };
                } else {
                    console.log('Using fallback response');
                    // Fallback to default responses
                    const generalResponses = [
                        "I'm Bera AI, created by Bruce Bera. I can help you with media downloads, music recognition, and music generation.",
                        "Hello! I'm Bera AI. How can I assist you today? I specialize in music and media tasks.",
                        "As Bera AI, created by Bruce Bera, I'm here to help. You can ask me about downloading media, identifying songs, or creating music.",
                        "I'm Bera AI. Need help with YouTube downloads, song identification, or music creation? I'm here to assist."
                    ];
                    
                    response = {
                        type: 'general_conversation',
                        message: generalResponses[Math.floor(Math.random() * generalResponses.length)],
                        voice_enabled: voiceEnabled,
                        creator: 'Bruce Bera'
                    };
                }
        }
        
        // Add voice response if requested
        if (voiceEnabled) {
            const voiceResponse = await VoiceService.generateSpeech(response.message);
            if (voiceResponse.success) {
                response.voice_audio = voiceResponse.audio;
                response.voice_format = voiceResponse.format;
            }
        }
        
        console.log('Sending response:', response.type);
        res.json({
            success: true,
            session_id: sessionId,
            response: response,
            timestamp: new Date().toISOString(),
            system: 'Bera AI',
            creator: 'Bruce Bera'
        });
        
    } catch (error) {
        console.error('Bera AI error:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: 'Bera AI is temporarily unavailable. Please try again.',
            creator: 'Bruce Bera',
            details: error.message
        });
    }
});

// Download Endpoints
app.post('/api/download/youtube-mp3', async (req, res) => {
    try {
        const { url } = req.body;
        
        if (!url || !(url.includes('youtube.com') || url.includes('youtu.be'))) {
            return res.status(400).json({
                error: 'Valid YouTube URL is required',
                example: 'https://www.youtube.com/watch?v=VIDEO_ID',
                creator: 'Bruce Bera'
            });
        }
        
        console.log('Processing YouTube MP3 download request for:', url);
        const result = await DownloadOrchestrator.processYouTubeMP3(url);
        
        res.json({
            ...result,
            system: 'Bera AI',
            creator: 'Bruce Bera',
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('Download endpoint error:', error);
        res.status(500).json({
            error: 'Download processing failed',
            details: error.message,
            creator: 'Bruce Bera'
        });
    }
});

app.post('/api/download/youtube-mp4', async (req, res) => {
    try {
        const { url } = req.body;
        
        if (!url || !(url.includes('youtube.com') || url.includes('youtu.be'))) {
            return res.status(400).json({
                error: 'Valid YouTube URL is required',
                example: 'https://www.youtube.com/watch?v=VIDEO_ID',
                creator: 'Bruce Bera'
            });
        }
        
        const result = await DownloadOrchestrator.processYouTubeMP4(url);
        res.json({
            ...result,
            system: 'Bera AI',
            creator: 'Bruce Bera',
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        res.status(500).json({
            error: 'Download processing failed',
            details: error.message,
            creator: 'Bruce Bera'
        });
    }
});

// Music Recognition Endpoint
app.post('/api/music/identify', upload.single('audio'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                error: 'Audio file is required',
                supported_formats: ['mp3', 'wav', 'm4a', 'webm'],
                max_size: '10MB',
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
            creator: 'Bruce Bera',
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        res.status(500).json({
            error: 'Music recognition failed',
            details: error.message,
            creator: 'Bruce Bera'
        });
    }
});

// Voice Generation Endpoint
app.post('/api/voice/generate', async (req, res) => {
    try {
        const { text, voice_id } = req.body;
        
        if (!text || typeof text !== 'string') {
            return res.status(400).json({
                error: 'Text is required for voice generation',
                creator: 'Bruce Bera'
            });
        }
        
        const voiceResult = await VoiceService.generateSpeech(text, voice_id);
        
        if (voiceResult.success) {
            res.json({
                success: true,
                audio_base64: voiceResult.audio,
                format: voiceResult.format,
                text_length: text.length,
                service: 'ElevenLabs (voice service provider)',
                system: 'Bera AI',
                creator: 'Bruce Bera'
            });
        } else {
            res.status(503).json({
                error: 'Voice service unavailable',
                message: 'Text response only available',
                creator: 'Bruce Bera'
            });
        }
        
    } catch (error) {
        res.status(500).json({
            error: 'Voice generation failed',
            creator: 'Bruce Bera'
        });
    }
});

// Admin endpoint (authenticated)
app.post('/api/admin/status', (req, res) => {
    if (req.headers['x-admin-token'] !== process.env.ADMIN_TOKEN) {
        return res.status(403).json({
            error: 'Unauthorized',
            message: 'Admin access required',
            creator: 'Bruce Bera'
        });
    }
    
    res.json({
        status: 'operational',
        version: '1.0.0',
        creator: 'Bruce Bera',
        system: 'Bera AI',
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV,
        services: {
            ai_core: 'active',
            download_orchestration: 'active',
            music_recognition: process.env.ACRCLOUD_ACCESS_KEY ? 'active' : 'inactive',
            voice_generation: process.env.ELEVENLABS_API_KEY && process.env.ELEVENLABS_API_KEY !== 'your_elevenlabs_api_key_here' ? 'active' : 'inactive',
            openai_enhancement: process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== 'your_openai_api_key_here' ? 'active' : 'inactive'
        },
        identity_enforcement: 'active',
        rate_limiting: 'active'
    });
});

// Identity verification endpoint
app.get('/api/identity', (req, res) => {
    res.json({
        system: 'Bera AI',
        creator: 'Bruce Bera',
        version: '1.0.0',
        proprietary: true,
        ownership: 'Exclusively owned and developed by Bruce Bera',
        third_party_tools: [
            process.env.ELEVENLABS_API_KEY && process.env.ELEVENLABS_API_KEY !== 'your_elevenlabs_api_key_here' ? 'ElevenLabs (voice synthesis)' : null,
            'GiftedTech APIs (media download)',
            process.env.ACRCLOUD_ACCESS_KEY ? 'ACRCloud (music recognition)' : null,
            process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== 'your_openai_api_key_here' ? 'OpenAI API (conversation enhancement)' : null
        ].filter(Boolean),
        note: 'Third-party services are tools only, not creators or owners of Bera AI',
        timestamp: new Date().toISOString()
    });
});

// Serve frontend in production
if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.join(__dirname, 'public')));
    
    app.get('*', (req, res) => {
        res.sendFile(path.join(__dirname, 'public', 'index.html'));
    });
}

// Error handling
app.use((err, req, res, next) => {
    console.error('Bera AI Error:', err);
    res.status(500).json({
        error: 'System error occurred',
        message: 'Bera AI is experiencing technical difficulties',
        creator: 'Bruce Bera',
        support: 'System created and maintained by Bruce Bera'
    });
});

// Start Bera AI Server
const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
    console.log(`
╔══════════════════════════════════════════════════════╗
║                 BERA AI SYSTEM ONLINE                ║
╠══════════════════════════════════════════════════════╣
║ Created and Owned by: Bruce Bera                     ║
║ Version: 1.0.0                                       ║
║ Environment: ${process.env.NODE_ENV || 'development'}${' '.repeat(22 - (process.env.NODE_ENV || 'development').length)}║
║ Port: ${PORT}${' '.repeat(46 - PORT.toString().length)}║
║ Status: Production Ready                             ║
╚══════════════════════════════════════════════════════╝

Services Available:
✓ AI Conversational Core
✓ Media Download Orchestration
${process.env.ACRCLOUD_ACCESS_KEY ? '✓ Music Recognition' : '○ Music Recognition (not configured)'}
${process.env.ELEVENLABS_API_KEY && process.env.ELEVENLABS_API_KEY !== 'your_elevenlabs_api_key_here' ? '✓ Voice Synthesis' : '○ Voice Synthesis (not configured)'}
${process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== 'your_openai_api_key_here' ? '✓ OpenAI Enhancement' : '○ OpenAI Enhancement (not configured)'}

System: Bera AI
Creator: Bruce Bera
Identity Rule: ACTIVE - Bruce Bera is exclusive creator/owner
    `);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('Bera AI shutting down gracefully...');
    server.close(() => {
        console.log('Bera AI shutdown complete.');
        process.exit(0);
    });
});
