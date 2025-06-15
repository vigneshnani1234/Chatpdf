// File Location: routes/index.js

// 1. Import Dependencies
const express = require('express');
const router = express.Router();
const multer = require('multer');
const langchainService = require('../services/langchainService');

// 2. Configure Multer for In-Memory File Storage
// This tells Multer to hold the uploaded file in memory as a Buffer,
// instead of saving it to disk. This is essential for deployment environments.
const storage = multer.memoryStorage();

// Create the Multer instance with the in-memory storage configuration.
// We also keep the file filter to only accept PDF files.
const upload = multer({
    storage: storage,
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'application/pdf') {
            cb(null, true);
        } else {
            cb(new Error('Only PDF files are allowed!'), false);
        }
    },
    // Optional: Add a file size limit (e.g., 20MB) to prevent large uploads
    limits: { fileSize: 20 * 1024 * 1024 } 
});


// 3. Define Application State (In-Memory for simplicity)
// This will hold our conversation history.
let chatHistory = [];


// 4. Define the Routes

// GET / - Renders the main upload page.
router.get('/', (req, res) => {
    res.render('index'); // Renders views/index.ejs
});

// POST /upload - Handles the PDF upload and processing from memory.
// 'upload.single('pdfFile')' is middleware that processes a single file from the form field named 'pdfFile'.
router.post('/upload', upload.single('pdfFile'), async (req, res) => {
    // Check if a file was uploaded and is available in memory
    if (!req.file) {
        return res.status(400).send('No file uploaded.');
    }

    try {
        console.log('File uploaded to memory:', req.file.originalname);
        // Reset chat history for the new document
        chatHistory = []; 

        // Call our service to process the PDF, passing the file's buffer (its content)
        // and its original name for logging purposes.
        await langchainService.processAndEmbedPdf(req.file.buffer, req.file.originalname);

        console.log('PDF processed and embedded successfully.');
        
        // Add a system message to the chat
        chatHistory.push({
            role: 'system',
            content: `PDF "${req.file.originalname}" processed. You can now ask questions about it.`
        });

        // Redirect the user to the chat page
        res.redirect('/chat');

    } catch (error) {
        console.error('Error processing PDF:', error);
        res.status(500).send(`Failed to process PDF. Error: ${error.message}`);
    }
});

// GET /chat - Renders the chat interface.
router.get('/chat', (req, res) => {
    res.render('chat', { chatHistory: chatHistory }); // Renders views/chat.ejs and passes the history
});

// POST /ask - Handles a new question from the user.
router.post('/ask', async (req, res) => {
    const userQuestion = req.body.question;

    if (!userQuestion) {
        return res.status(400).send('No question provided.');
    }

    try {
        // Add user's question to history
        chatHistory.push({ role: 'user', content: userQuestion });

        // Get the answer from our LangChain service
        const answer = await langchainService.getAnswerFromChain(userQuestion);
        
        // Add AI's answer to history
        chatHistory.push({ role: 'ai', content: answer });

        // Redirect back to the chat page to display the updated history
        res.redirect('/chat');

    } catch (error) {
        console.error('Error getting answer:', error);
        // Add an error message to the chat to inform the user
        chatHistory.push({ role: 'system', content: `Sorry, an error occurred while getting the answer. Error: ${error.message}` });
        res.redirect('/chat');
    }
});


// 5. Export the router
module.exports = router;