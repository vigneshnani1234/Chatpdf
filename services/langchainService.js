// File Location: services/langchainService.js

// 1. Import Dependencies
const { Pinecone } = require('@pinecone-database/pinecone');
const { PDFLoader } = require('@langchain/community/document_loaders/fs/pdf');
const { RecursiveCharacterTextSplitter } = require('langchain/text_splitter');
const { GoogleGenerativeAIEmbeddings, ChatGoogleGenerativeAI } = require('@langchain/google-genai');
const { PineconeStore } = require('@langchain/pinecone');
const { createStuffDocumentsChain } = require("langchain/chains/combine_documents");
const { createRetrievalChain } = require("langchain/chains/retrieval");
const { ChatPromptTemplate } = require("@langchain/core/prompts");
const { v4: uuidv4 } = require('uuid');
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
    model: "gemini-1.5-flash-latest", // Using a modern, reliable model
    apiKey: process.env.GOOGLE_API_KEY,
});

// A simple in-memory store for the current PDF's namespace
let currentNamespace = null;


// 3. Define the Processing Function (updated for in-memory processing)
async function processAndEmbedPdf(pdfBuffer, originalname) {
    console.log(`Starting PDF processing for: ${originalname}`);

    // Create a Blob from the Buffer. The PDFLoader can process this Blob in memory.
    const pdfBlob = new Blob([pdfBuffer], { type: 'application/pdf' });

    // Step 1: Load the PDF document from the in-memory Blob
    const loader = new PDFLoader(pdfBlob);
    const docs = await loader.load();
    console.log(`Loaded ${docs.length} document(s) from the PDF.`);

    // Important check: If the PDF is image-based, docs will be empty.
    if (docs.length === 0) {
        console.log("No text could be extracted from the PDF. Aborting processing.");
        throw new Error("Could not extract any text from the PDF. It might be an image-based file or corrupted.");
    }

    // Step 2: Split the document into smaller chunks
    const splitter = new RecursiveCharacterTextSplitter({
        chunkSize: 1000,
        chunkOverlap: 200,
    });
    const splitDocs = await splitter.splitDocuments(docs);
    console.log(`Split document into ${splitDocs.length} chunks.`);

    // Step 3: Create a unique namespace for this document
    currentNamespace = uuidv4();
    console.log(`Generated unique namespace: ${currentNamespace}`);

    // Step 4: Embed the chunks and store them in Pinecone
    console.log('Embedding chunks and storing in Pinecone...');
    await PineconeStore.fromDocuments(splitDocs, embeddings, {
        pineconeIndex,
        namespace: currentNamespace,
        maxConcurrency: 5,
    });
    console.log('Successfully embedded and stored document in Pinecone.');

    // Step 5 is no longer needed because no file was saved to disk.
}


// 4. Define the RAG (Retrieval-Augmented Generation) Function (no changes needed here)
async function getAnswerFromChain(question) {
    if (!currentNamespace) {
        throw new Error("A PDF has not been processed yet. Please upload a PDF first.");
    }
    console.log(`Querying with question: "${question}" in namespace: "${currentNamespace}"`);

    // Step 1: Create a vector store retriever
    const vectorStore = await PineconeStore.fromExistingIndex(embeddings, {
        pineconeIndex,
        namespace: currentNamespace,
    });
    const retriever = vectorStore.asRetriever();

    // Step 2: Create a prompt template
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
    const documentChain = await createStuffDocumentsChain({
        llm: llm,
        prompt: prompt,
    });

    // Step 4: Create the master retrieval chain
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