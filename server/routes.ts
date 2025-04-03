import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { nanoid } from "nanoid";
import { storage } from "./storage";
import { generatePersonaResponse } from "./lib/openai";
import { insertMessageSchema, insertChatSessionSchema } from "@shared/schema";
import { z } from "zod";

export async function registerRoutes(app: Express): Promise<Server> {
  // Get all personas
  app.get("/api/personas", async (req: Request, res: Response) => {
    try {
      const personas = await storage.getPersonas();
      res.json(personas);
    } catch (error) {
      console.error("Error fetching personas:", error);
      res.status(500).json({ message: "Failed to fetch personas" });
    }
  });

  // Get personas by category
  app.get("/api/personas/category/:category", async (req: Request, res: Response) => {
    try {
      const { category } = req.params;
      const personas = await storage.getPersonasByCategory(category);
      res.json(personas);
    } catch (error) {
      console.error(`Error fetching personas by category ${req.params.category}:`, error);
      res.status(500).json({ message: "Failed to fetch personas by category" });
    }
  });

  // Search personas
  app.get("/api/personas/search", async (req: Request, res: Response) => {
    try {
      const query = req.query.q as string || "";
      if (!query) {
        const allPersonas = await storage.getPersonas();
        return res.json(allPersonas);
      }
      
      const personas = await storage.searchPersonas(query);
      res.json(personas);
    } catch (error) {
      console.error(`Error searching personas with query ${req.query.q}:`, error);
      res.status(500).json({ message: "Failed to search personas" });
    }
  });

  // Get a specific persona by ID
  app.get("/api/personas/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid persona ID" });
      }
      
      const persona = await storage.getPersonaById(id);
      if (!persona) {
        return res.status(404).json({ message: "Persona not found" });
      }
      
      res.json(persona);
    } catch (error) {
      console.error(`Error fetching persona with ID ${req.params.id}:`, error);
      res.status(500).json({ message: "Failed to fetch persona" });
    }
  });

  // Create or get a chat session
  app.post("/api/sessions", async (req: Request, res: Response) => {
    try {
      // Check if sessionId is provided
      let { sessionId, personaId } = req.body;
      
      // Validate personaId
      if (personaId && typeof personaId === "string") {
        personaId = parseInt(personaId);
      }
      
      // If no sessionId provided, create a new one
      if (!sessionId) {
        sessionId = nanoid();
        
        const sessionData = {
          sessionId,
          currentPersonaId: personaId || undefined
        };
        
        const validatedData = insertChatSessionSchema.parse(sessionData);
        const newSession = await storage.createChatSession(validatedData);
        
        return res.status(201).json(newSession);
      }
      
      // If sessionId provided, get existing session
      const existingSession = await storage.getChatSessionById(sessionId);
      
      // If session exists and personaId is different, update the persona
      if (existingSession && personaId && existingSession.currentPersonaId !== personaId) {
        const updatedSession = await storage.updateChatSessionPersona(sessionId, personaId);
        return res.json(updatedSession);
      }
      
      // If session exists, return it
      if (existingSession) {
        return res.json(existingSession);
      }
      
      // If session doesn't exist, create a new one with the provided sessionId
      const sessionData = {
        sessionId,
        currentPersonaId: personaId || undefined
      };
      
      const validatedData = insertChatSessionSchema.parse(sessionData);
      const newSession = await storage.createChatSession(validatedData);
      
      res.status(201).json(newSession);
    } catch (error) {
      console.error("Error creating or getting chat session:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid session data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create or get chat session" });
    }
  });

  // Change persona in a chat session
  app.patch("/api/sessions/:sessionId/persona", async (req: Request, res: Response) => {
    try {
      const { sessionId } = req.params;
      const { personaId } = req.body;
      
      if (!personaId || isNaN(parseInt(personaId.toString()))) {
        return res.status(400).json({ message: "Invalid persona ID" });
      }
      
      const parsedPersonaId = parseInt(personaId.toString());
      
      // Check if persona exists
      const persona = await storage.getPersonaById(parsedPersonaId);
      if (!persona) {
        return res.status(404).json({ message: "Persona not found" });
      }
      
      // Check if session exists
      const session = await storage.getChatSessionById(sessionId);
      if (!session) {
        return res.status(404).json({ message: "Chat session not found" });
      }
      
      // Update session with new persona
      const updatedSession = await storage.updateChatSessionPersona(sessionId, parsedPersonaId);
      
      // Add system message about persona change
      await storage.createMessage({
        sessionId,
        role: "system",
        content: `You are now chatting with ${persona.name}.`,
        personaId: parsedPersonaId
      });
      
      res.json(updatedSession);
    } catch (error) {
      console.error(`Error changing persona for session ${req.params.sessionId}:`, error);
      res.status(500).json({ message: "Failed to change persona" });
    }
  });

  // Get messages for a chat session
  app.get("/api/sessions/:sessionId/messages", async (req: Request, res: Response) => {
    try {
      const { sessionId } = req.params;
      
      // Check if session exists
      const session = await storage.getChatSessionById(sessionId);
      if (!session) {
        return res.status(404).json({ message: "Chat session not found" });
      }
      
      const messages = await storage.getMessagesBySessionId(sessionId);
      res.json(messages);
    } catch (error) {
      console.error(`Error fetching messages for session ${req.params.sessionId}:`, error);
      res.status(500).json({ message: "Failed to fetch messages" });
    }
  });

  // Send a message and get a response
  app.post("/api/sessions/:sessionId/messages", async (req: Request, res: Response) => {
    try {
      const { sessionId } = req.params;
      const { content } = req.body;
      
      if (!content || typeof content !== "string" || content.trim() === "") {
        return res.status(400).json({ message: "Message content is required" });
      }
      
      // Check if session exists
      const session = await storage.getChatSessionById(sessionId);
      if (!session) {
        return res.status(404).json({ message: "Chat session not found" });
      }
      
      // Check if session has a persona
      if (!session.currentPersonaId) {
        return res.status(400).json({ message: "No persona selected for this chat session" });
      }
      
      // Get the current persona
      const persona = await storage.getPersonaById(session.currentPersonaId);
      if (!persona) {
        return res.status(404).json({ message: "Persona not found" });
      }
      
      // Create user message
      const userMessageData = {
        sessionId,
        role: "user",
        content,
        personaId: session.currentPersonaId
      };
      
      const validatedUserMessage = insertMessageSchema.parse(userMessageData);
      const savedUserMessage = await storage.createMessage(validatedUserMessage);
      
      // Get conversation history
      const allMessages = await storage.getMessagesBySessionId(sessionId);
      
      // Format messages for OpenAI
      const conversationHistory = allMessages
        .filter(msg => msg.role !== "system") // Exclude system messages
        .map(msg => ({
          role: msg.role,
          content: msg.content
        }));
      
      // Generate response from AI as the persona
      const aiResponse = await generatePersonaResponse(
        persona,
        conversationHistory.slice(0, -1), // Exclude the latest user message
        content
      );
      
      // Save AI response
      const assistantMessageData = {
        sessionId,
        role: "assistant",
        content: aiResponse.content,
        personaId: session.currentPersonaId
      };
      
      const validatedAssistantMessage = insertMessageSchema.parse(assistantMessageData);
      const savedAssistantMessage = await storage.createMessage(validatedAssistantMessage);
      
      // Return both messages
      res.status(201).json({
        userMessage: savedUserMessage,
        assistantMessage: savedAssistantMessage
      });
    } catch (error) {
      console.error(`Error sending message for session ${req.params.sessionId}:`, error);
      
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid message data", errors: error.errors });
      }
      
      // Handle OpenAI API errors
      if (error.message === "Failed to generate response from OpenAI API") {
        return res.status(503).json({ 
          message: "Unable to generate response from AI service. Please try again later."
        });
      }
      
      res.status(500).json({ message: "Failed to process message" });
    }
  });

  // Clear chat history
  app.delete("/api/sessions/:sessionId/messages", async (req: Request, res: Response) => {
    // For this in-memory implementation, we'll simply respond that it was successful
    // In a real DB implementation, we would delete all messages for the session
    res.status(204).send();
  });

  const httpServer = createServer(app);
  return httpServer;
}
