// 1. Import Core Modules
const express = require('express');
const path = require('path');
const dotenv = require('dotenv');

// Import the router we will create
const routes = require('./routes/index');

// 2. Initial Configuration
// Load environment variables from the .env file
dotenv.config();

// Initialize the express app
const app = express();
const PORT = process.env.PORT || 3000;

// 3. Set Up View Engine (EJS)
// Tell Express where to find our view templates
app.set('views', path.join(__dirname, 'views'));
// Set EJS as the template engine
app.set('view engine', 'ejs');

// 4. Set Up Middleware
// Serve static files (CSS, client-side JS) from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// Parse URL-encoded bodies (as sent by HTML forms)
app.use(express.urlencoded({ extended: true }));

// Parse JSON bodies (as sent by API clients)
app.use(express.json());

// 5. Connect the Router
// Use the routes defined in './routes/index.js' for all incoming requests
app.use('/', routes);


// 6. Basic Error Handling Middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send('Something broke!');
});


// 7. Start the Server
app.listen(PORT, () => {
    console.log(`Server is running beautifully on http://localhost:${PORT}`);
});