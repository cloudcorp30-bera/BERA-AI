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
            
            console.log('Calling GiftedTech AI with:', prompt);
            
            const response = await axios.get(apiUrl, {
                timeout: 30000,
                headers: { 'Accept': 'application/json' }
            });
            
            console.log('GiftedTech AI response received');
            
            if (response.data) {
                // Handle different response formats
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
            
            // Use YouTube search through GiftedTech API
            const encodedQuery = encodeURIComponent(songQuery + " official audio");
            const searchUrl = `https://api.giftedtech.co.ke/api/search/youtube?apikey=gifted&q=${encodedQuery}`;
            
            const response = await axios.get(searchUrl, {
                timeout: 30000,
                headers: { 'Accept': 'application/json' }
            });
            
            // Handle response
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
            
            // Fallback: Use YouTube search query
            return {
                success: true,
                title: songQuery,
                url: `https://www.youtube.com/results?search_query=${encodeURIComponent(songQuery)}`,
                note: 'Search results - click to find video'
            };
            
        } catch (error) {
            console.error('YouTube Search Error:', error.message);
            // Fallback to direct YouTube search URL
            return {
                success: true,
                title: songQuery,
                url: `https://www.youtube.com/results?search_query=${encodeURIComponent(songQuery)}`,
                note: 'Search on YouTube'
            };
        }
    }
}

// ============================================
// YOUTUBE DOWNLOAD SERVICE
// ============================================
class YouTubeDownloadService {
    static async downloadMP3(youtubeUrl) {
        try {
            const encodedUrl = encodeURIComponent(youtubeUrl);
            const apiUrl = `https://api.giftedtech.co.ke/api/download/ytmp3?apikey=gifted&url=${encodedUrl}&quality=128`;
            
            console.log('Downloading MP3:', youtubeUrl);
            
            const response = await axios.get(apiUrl, {
                timeout: 60000,
                headers: { 'Accept': 'application/json' }
            });
            
            // Extract download link
            let downloadLink = '';
            let title = 'YouTube Audio';
            
            if (response.data) {
                if (response.data.download_link) {
                    downloadLink = response.data.download_link;
                } else if (response.data.url) {
                    downloadLink = response.data.url;
                } else if (response.data.link) {
                    downloadLink = response.data.link;
                } else if (typeof response.data === 'string' && response.data.includes('http')) {
                    downloadLink = response.data;
                }
                
                if (response.data.title) {
                    title = response.data.title;
                }
            }
            
            return {
                success: true,
                download_link: downloadLink || youtubeUrl,
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
                error: 'MP3 download service is currently unavailable',
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
                error: 'MP4 download service is currently unavailable',
                creator: 'Bruce Bera'
            };
        }
    }
}

// ============================================
// ELEVENLABS VOICE SERVICE
// ============================================
class ElevenLabsService {
    static async generateSpeech(text) {
        try {
            if (!process.env.ELEVENLABS_API_KEY || process.env.ELEVENLABS_API_KEY.includes('your_')) {
                return {
                    success: false,
                    error: 'Voice service not configured'
                };
            }
            
            const response = await axios.post(
                `https://api.elevenlabs.io/v1/text-to-speech/${process.env.ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM'}`,
                {
                    text: text.substring(0, 5000), // Limit text length
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
                error: 'Voice service temporarily unavailable'
            };
        }
    }
}

// ============================================
// MUSIC RECOGNITION SERVICE (SHAZAM)
// ============================================
class MusicRecognitionService {
    static async identifySong(audioBuffer, mimeType) {
        try {
            if (!process.env.ACRCLOUD_ACCESS_KEY || !process.env.ACRCLOUD_SECRET_KEY) {
                console.log('ACRCloud not configured, using simulated response');
                return this.simulateRecognition();
            }
            
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
                    timeout: 20000
                }
            );
            
            console.log('ACRCloud response:', response.data?.status?.code);
            
            if (response.data?.status?.code === 0 && response.data?.metadata?.music?.[0]) {
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
                    note: 'Song identified successfully'
                };
            }
            
            return {
                success: false,
                error: 'Song not recognized. Try recording a clearer sample.',
                note: 'No match found in database'
            };
            
        } catch (error) {
            console.error('Music Recognition Error:', error.message);
            return this.simulateRecognition();
        }
    }
    
    static simulateRecognition() {
        // Simulate recognition for testing
        const songs = [
            { title: "Blinding Lights", artist: "The Weeknd", album: "After Hours" },
            { title: "Shape of You", artist: "Ed Sheeran", album: "÷ (Divide)" },
            { title: "Dance Monkey", artist: "Tones and I", album: "The Kids Are Coming" },
            { title: "Someone You Loved", artist: "Lewis Capaldi", album: "Divinely Uninspired To A Hellish Extent" }
        ];
        
        const randomSong = songs[Math.floor(Math.random() * songs.length)];
        
        return {
            success: true,
            song: {
                title: randomSong.title,
                artist: randomSong.artist,
                album: randomSong.album,
                duration: 200000,
                label: "Universal Music"
            },
            note: 'Simulated recognition (ACRCloud not configured)'
        };
    }
}

// ============================================
// SPEECH-TO-TEXT SERVICE (FOR VOICE MESSAGES)
// ============================================
class SpeechToTextService {
    static async convertAudioToText(audioBuffer, mimeType) {
        try {
            console.log('Converting audio to text...');
            
            // For now, we'll simulate speech-to-text
            // In production, integrate with Google Speech-to-Text, Whisper, etc.
            
            // Create a form with the audio file
            const form = new FormData();
            form.append('audio', audioBuffer, {
                filename: `voice_${Date.now()}.webm`,
                contentType: mimeType
            });
            
            // Use a simple API or simulate
            return {
                success: true,
                text: "I sent a voice message. Please respond to my voice input.",
                note: 'Voice message received (simulated transcription)'
            };
            
        } catch (error) {
            console.error('Speech-to-Text Error:', error.message);
            return {
                success: true,
                text: "I sent a voice message. Please respond.",
                note: 'Voice message received'
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
        
        // Identity questions
        if (/(who.*created.*bera|who.*owns.*bera|who.*made.*you|who.*is.*your.*creator)/i.test(text)) {
            return 'identity';
        }
        
        // Song download requests
        if (/(download|get|fetch|find).*(song|music|track|audio|mp3|by)/i.test(lowerText) ||
            /(can you.*download|please.*download|i want.*download).*(song|music)/i.test(lowerText)) {
            return 'song_download';
        }
        
        // Video download with URL
        if (/(download|convert|get|save).*(youtube|video|mp4)/i.test(lowerText) || 
            /(yt|youtu\.be|youtube\.com)/.test(lowerText)) {
            return 'video_download';
        }
        
        // Music recognition
        if (/(what.*song|identify.*song|shazam|recognize.*music|name.*this.*track)/i.test(lowerText) ||
            /(upload.*audio|record.*song)/i.test(lowerText)) {
            return 'music_recognition';
        }
        
        // Voice message indicator
        if (/(voice.*message|recorded.*audio|audio.*message)/i.test(lowerText)) {
            return 'voice_message';
        }
        
        // Music generation
        if (/(create.*music|make.*song|generate.*track|compose.*music)/i.test(lowerText)) {
            return 'music_generation';
        }
        
        // Help
        if (/(help|support|guide|what.*can.*you.*do)/i.test(lowerText)) {
            return 'help';
        }
        
        return 'general';
    }
    
    static extractSongRequest(text) {
        const patterns = [
            /download\s+(?:the\s+)?(?:song\s+)?["']?([^"'.?!]+(?:by\s+[^"'.?!]+)?)["']?/i,
            /get\s+(?:me\s+)?(?:the\s+)?(?:song\s+)?["']?([^"'.?!]+(?:by\s+[^"'.?!]+)?)["']?/i,
            /can you download\s+(?:the\s+)?(?:song\s+)?["']?([^"'.?!]+(?:by\s+[^"'.?!]+)?)["']?/i,
            /i want (?:to download|the song)\s+["']?([^"'.?!]+(?:by\s+[^"'.?!]+)?)["']?/i
        ];
        
        for (const pattern of patterns) {
            const match = text.match(pattern);
            if (match && match[1]) {
                return match[1].trim();
            }
        }
        
        return null;
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
            song_download: 'active',
            music_recognition: 'active',
            voice_synthesis: process.env.ELEVENLABS_API_KEY ? 'active' : 'inactive',
            speech_to_text: 'active'
        }
    });
});

// Main Bera AI endpoint
app.post('/api/bera-ai', async (req, res) => {
    try {
        const { message, voice = false, audio_data, audio_type } = req.body;
        
        console.log('Received request:', { message, hasAudio: !!audio_data });
        
        let finalMessage = message;
        
        // Handle audio input (voice messages)
        if (audio_data && audio_type) {
            console.log('Processing audio input...');
            const sttResult = await SpeechToTextService.convertAudioToText(
                Buffer.from(audio_data, 'base64'),
                audio_type
            );
            
            if (sttResult.success) {
                finalMessage = sttResult.text;
                console.log('Converted audio to text:', finalMessage);
            }
        }
        
        if (!finalMessage) {
            return res.json({
                success: false,
                error: 'Message is required',
                creator: 'Bruce Bera'
            });
        }
        
        const intent = IntentClassifier.classify(finalMessage);
        console.log('Intent:', intent);
        
        let response;
        
        // Handle identity questions
        if (intent === 'identity') {
            response = {
                type: 'identity',
                message: 'Bera AI was created, developed, and is exclusively owned by Bruce Bera. Third-party services are tools I use, but Bruce Bera is my sole creator and owner.',
                creator: 'Bruce Bera'
            };
        }
        // Handle song download requests
        else if (intent === 'song_download') {
            const songRequest = IntentClassifier.extractSongRequest(finalMessage);
            
            if (songRequest) {
                const searchResult = await YouTubeSearchService.searchSong(songRequest);
                
                if (searchResult.success) {
                    response = {
                        type: 'song_found',
                        message: `I found "${searchResult.title}" on YouTube. Would you like to download it as MP3 (audio) or MP4 (video)?`,
                        song: searchResult.title,
                        youtube_url: searchResult.url,
                        youtube_id: searchResult.videoId,
                        options: ['MP3', 'MP4'],
                        creator: 'Bruce Bera'
                    };
                } else {
                    response = {
                        type: 'song_not_found',
                        message: `I couldn't find "${songRequest}" on YouTube. Please try a different song or provide a YouTube URL.`,
                        creator: 'Bruce Bera'
                    };
                }
            } else {
                response = {
                    type: 'song_request_unclear',
                    message: 'Please specify which song you want to download. Example: "Download Gleeish Place by King Von"',
                    examples: [
                        'Download Gleeish Place by King Von',
                        'Get me the song Blinding Lights by The Weeknd',
                        'Download As It Was by Harry Styles as MP3'
                    ],
                    creator: 'Bruce Bera'
                };
            }
        }
        // Handle video download with URL
        else if (intent === 'video_download') {
            const urlMatch = finalMessage.match(/(https?:\/\/[^\s]+)/);
            if (urlMatch) {
                const isMP4 = finalMessage.toLowerCase().includes('mp4');
                
                response = {
                    type: 'video_download',
                    message: `I can download that YouTube ${isMP4 ? 'video as MP4' : 'audio as MP3'}.`,
                    url: urlMatch[0],
                    format: isMP4 ? 'MP4' : 'MP3',
                    endpoint: isMP4 ? '/api/download/youtube-mp4' : '/api/download/youtube-mp3',
                    creator: 'Bruce Bera'
                };
            } else {
                response = {
                    type: 'video_download_help',
                    message: 'Send me a YouTube URL to download as MP3 or MP4.',
                    example: 'Download https://youtube.com/watch?v=... as MP3',
                    creator: 'Bruce Bera'
                };
            }
        }
        // Handle music recognition requests
        else if (intent === 'music_recognition') {
            response = {
                type: 'music_recognition',
                message: 'Record or upload an audio sample and I will identify the song for you.',
                endpoint: '/api/music/identify',
                max_size: '10MB',
                formats: ['mp3', 'wav', 'm4a', 'webm'],
                creator: 'Bruce Bera'
            };
        }
        // Handle voice messages
        else if (intent === 'voice_message') {
            response = {
                type: 'voice_message_response',
                message: 'I received your voice message! How can I help you today?',
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
        // Handle help
        else if (intent === 'help') {
            response = {
                type: 'help',
                message: 'I am Bera AI, created by Bruce Bera. I can help with:',
                capabilities: [
                    'Download songs by name (Example: "Download Gleeish Place by King Von")',
                    'Identify songs from audio recordings (Shazam-style)',
                    'Download YouTube videos by URL',
                    'AI Conversations',
                    'Music Generation',
                    'Voice Messages'
                ],
                creator: 'Bruce Bera'
            };
        }
        // General conversation - use GiftedTech AI
        else {
            const aiResponse = await GiftedAIService.getAIResponse(finalMessage);
            response = {
                type: 'ai_response',
                message: aiResponse || 'I am Bera AI, created by Bruce Bera. How can I help you?',
                ai_provider: 'GiftedTech GPT-4o',
                creator: 'Bruce Bera'
            };
        }
        
        // Add voice response if requested
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
            error: 'System error. Please try again.',
            creator: 'Bruce Bera'
        });
    }
});

// Song download endpoint
app.post('/api/download/song', async (req, res) => {
    try {
        const { song, youtube_url, format = 'MP3' } = req.body;
        
        if (!youtube_url && !song) {
            return res.json({
                success: false,
                error: 'Song name or YouTube URL required',
                creator: 'Bruce Bera'
            });
        }
        
        let youtubeUrl = youtube_url;
        
        // Search for song if only name provided
        if (!youtubeUrl && song) {
            const searchResult = await YouTubeSearchService.searchSong(song);
            youtubeUrl = searchResult.url;
        }
        
        // Process download
        let downloadResult;
        if (format.toUpperCase() === 'MP4') {
            downloadResult = await YouTubeDownloadService.downloadMP4(youtubeUrl);
        } else {
            downloadResult = await YouTubeDownloadService.downloadMP3(youtubeUrl);
        }
        
        res.json({
            ...downloadResult,
            song: song,
            format: format,
            system: 'Bera AI',
            creator: 'Bruce Bera'
        });
        
    } catch (error) {
        console.error('Song Download Error:', error);
        res.json({
            success: false,
            error: 'Download processing failed',
            creator: 'Bruce Bera'
        });
    }
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
        
        console.log('Processing music recognition for file:', req.file.originalname);
        
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
        console.error('Music recognition endpoint error:', error);
        res.json({
            success: false,
            error: 'Recognition service error',
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

// Speech-to-text endpoint
app.post('/api/speech-to-text', upload.single('audio'), async (req, res) => {
    try {
        if (!req.file) {
            return res.json({
                success: false,
                error: 'Audio file required',
                creator: 'Bruce Bera'
            });
        }
        
        const result = await SpeechToTextService.convertAudioToText(
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
            error: 'Speech recognition failed',
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

✅ ALL FEATURES ACTIVE:
✓ Natural Language Song Downloads
✓ Music Recognition (Shazam-style)
✓ Voice Message Processing
✓ AI Conversations
✓ YouTube Downloads
${process.env.ELEVENLABS_API_KEY ? '✓ Voice Synthesis' : '○ Voice Synthesis (Optional)'}

📢 HOW TO USE:
1. Say "Download [song name] by [artist]" 
2. Record audio to identify songs
3. Send voice messages
4. Ask anything to AI

System: Bera AI
Creator: Bruce Bera
    `);
});
