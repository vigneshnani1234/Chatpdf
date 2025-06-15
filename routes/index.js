// 1. Import Dependencies
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = 'path'; // We'll need this, but it's part of Node, no install needed

// We will create this service file in the next step. It will contain all our AI logic.
const langchainService = require('../services/langchainService');


// 2. Configure Multer for File Uploads
// This tells Multer where to store the uploaded files and how to name them.
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        // The destination is the 'uploads/' directory we created.
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        // We'll name the file with its original name plus a timestamp to avoid conflicts.
        cb(null, `${Date.now()}-${file.originalname}`);
    }
});

// Create the Multer instance with the storage configuration.
// We also add a file filter to only accept PDF files.
const upload = multer({
    storage: storage,
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'application/pdf') {
            cb(null, true);
        } else {
            cb(new Error('Only PDF files are allowed!'), false);
        }
    }
});


// 3. Define Application State (In-Memory for simplicity)
// This will hold our conversation history. For a real app, you'd use a database or session.
let chatHistory = [];


// 4. Define the Routes

// GET / - Renders the main upload page.
router.get('/', (req, res) => {
    res.render('index'); // Renders views/index.ejs
});

// POST /upload - Handles the PDF upload and processing.
// 'upload.single('pdfFile')' is middleware that processes a single file from the form field named 'pdfFile'.
router.post('/upload', upload.single('pdfFile'), async (req, res) => {
    // Check if a file was uploaded
    if (!req.file) {
        return res.status(400).send('No file uploaded.');
    }

    try {
        console.log('File uploaded:', req.file.path);
        // Reset chat history for the new document
        chatHistory = []; 

        // Call our service to process the PDF and embed it in Pinecone
        await langchainService.processAndEmbedPdf(req.file.path);

        console.log('PDF processed and embedded successfully.');
        
        // Add a system message to the chat
        chatHistory.push({
            role: 'system',
            content: 'PDF processed. You can now ask questions about it.'
        });

        // Redirect the user to the chat page
        res.redirect('/chat');

    } catch (error) {
        console.error('Error processing PDF:', error);
        res.status(500).send('Failed to process PDF.');
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
        chatHistory.push({ role: 'system', content: 'Sorry, an error occurred while getting the answer.' });
        res.redirect('/chat');
    }
});


// 5. Export the router
module.exports = router;