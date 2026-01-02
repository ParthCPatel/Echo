import mongoose from 'mongoose';

const SessionSchema = new mongoose.Schema({
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  audioPath: {
    type: String,
    required: true
  },
  rawNotes: {
    type: String,
    default: ""
  },
  // We store the full raw transcript if needed, 
  // or the diarized format. Flexible structure.
  transcript: {
    type: mongoose.Schema.Types.Mixed,
    default: []
  },
  
  // AI Enhanced Results
  summary: {
    type: String,
    default: ""
  },
  structuredNotes: {
    type: String,
    default: ""
  },
  actionItems: [{
    text: String,
    owner: String,
    status: { type: String, default: 'open' }
  }],
  decisions: [{
    text: String,
    evidence_quote: String
  }],
  
  tags: [String]
});

export const Session = mongoose.model('Session', SessionSchema);
