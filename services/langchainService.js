// 1. Import Dependencies
const { Pinecone } = require('@pinecone-database/pinecone');
const { PDFLoader } = require('@langchain/community/document_loaders/fs/pdf');
const { RecursiveCharacterTextSplitter } = require('langchain/text_splitter');
const { GoogleGenerativeAIEmbeddings, ChatGoogleGenerativeAI } = require('@langchain/google-genai');
const { PineconeStore } = require('@langchain/pinecone');
const { createStuffDocumentsChain } = require("langchain/chains/combine_documents");
const { createRetrievalChain } = require("langchain/chains/retrieval");
const { ChatPromptTemplate } = require("@langchain/core/prompts");
const { v4: uuidv4 } = require('uuid'); // To generate unique IDs for namespaces
const fs = require('fs/promises'); // To delete files after processing
const dotenv = require('dotenv');

dotenv.config();

// 2. Initialize Clients and Models
// Initialize Pinecone client
const pinecone = new Pinecone();
const pineconeIndex = pinecone.index(process.env.PINECONE_INDEX_NAME);

// Initialize Gemini Embeddings model
const embeddings = new GoogleGenerativeAIEmbeddings({
    modelName: "embedding-001",
    apiKey: process.env.GOOGLE_API_KEY,
});

// Initialize Gemini Chat model for generation
const llm = new ChatGoogleGenerativeAI({
    model: "gemini-1.5-flash-latest",
    apiKey: process.env.GOOGLE_API_KEY,
});

// A simple in-memory store for the current PDF's namespace
// In a real multi-user app, this would be managed differently (e.g., in user sessions)
let currentNamespace = null;


// 3. Define the Processing Function
async function processAndEmbedPdf(pdfFilePath) {
    console.log('Starting PDF processing...');

    // Step 1: Load the PDF document
    const loader = new PDFLoader(pdfFilePath);
    const docs = await loader.load();
    console.log(`Loaded ${docs.length} document(s) from the PDF.`);

    // Step 2: Split the document into smaller chunks
    const splitter = new RecursiveCharacterTextSplitter({
        chunkSize: 1000, // 1000 characters per chunk
        chunkOverlap: 200, // 200 characters overlap between chunks
    });
    const splitDocs = await splitter.splitDocuments(docs);
    console.log(`Split document into ${splitDocs.length} chunks.`);

    // Step 3: Create a unique namespace for this document
    // This is crucial for separating data from different PDFs in the same Pinecone index
    currentNamespace = uuidv4();
    console.log(`Generated unique namespace: ${currentNamespace}`);

    // Step 4: Embed the chunks and store them in Pinecone
    console.log('Embedding chunks and storing in Pinecone...');
    await PineconeStore.fromDocuments(splitDocs, embeddings, {
        pineconeIndex,
        namespace: currentNamespace,
        maxConcurrency: 5, // Optional, limit concurrent requests
    });
    console.log('Successfully embedded and stored document in Pinecone.');

    // Step 5: Clean up the uploaded file
    await fs.unlink(pdfFilePath);
    console.log(`Deleted temporary file: ${pdfFilePath}`);
}


// 4. Define the RAG (Retrieval-Augmented Generation) Function
async function getAnswerFromChain(question) {
    if (!currentNamespace) {
        throw new Error("PDF has not been processed yet. Please upload a PDF first.");
    }
    console.log(`Querying with question: "${question}" in namespace: "${currentNamespace}"`);

    // Step 1: Create a vector store retriever
    // This object fetches the relevant documents from Pinecone
    const vectorStore = await PineconeStore.fromExistingIndex(embeddings, {
        pineconeIndex,
        namespace: currentNamespace,
    });
    const retriever = vectorStore.asRetriever();

    // Step 2: Create a prompt template
    // This tells the LLM how to use the retrieved context and the question
    const prompt = ChatPromptTemplate.fromTemplate(`
        Answer the following question based only on the provided context.
        If you cannot find the answer in the context, just say, "I could not find the answer in the provided document."
        Provide a detailed and comprehensive answer based on the context.

        <context>
        {context}
        </context>

        Question: {input}
    `);

    // Step 3: Create the "stuff documents" chain
    // This chain takes the question and the retrieved documents and "stuffs" them into the prompt.
    const documentChain = await createStuffDocumentsChain({
        llm: llm,
        prompt: prompt,
    });

    // Step 4: Create the master retrieval chain
    // This chain orchestrates the entire process: retrieval -> stuffing -> generation
    const retrievalChain = await createRetrievalChain({
        retriever: retriever,
        combineDocsChain: documentChain,
    });

    // Step 5: Invoke the chain with the user's question
    console.log('Invoking the retrieval chain...');
    const result = await retrievalChain.invoke({
        input: question,
    });

    console.log('Chain invocation complete. Result:', result.answer);
    return result.answer;
}


// 5. Export the functions
module.exports = {
    processAndEmbedPdf,
    getAnswerFromChain
};