import React, { useState, useEffect } from 'react';
import axios from 'axios';
import DOMPurify from 'dompurify';
import ResetWeightsButton from './components/ResetWeightsButton';
import MemoryList from './components/MemoryList';

// Update the Memory interface in MemoryApp.tsx
interface Memory {
  id: number;
  title: string;
  location: string;
  date: string;
  keywords?: string[];  // These might be openai_keywords from backend
  type: string;
  description?: string;
  weight?: number;
  filename?: string;
  // Backend response fields
  image_url?: string;
  original_path?: string;
  processed_path?: string;
  openai_keywords?: string[];
  openai_description?: string;
  impact_weight?: number;  // This is the actual weight field from backend
  detected_objects?: string[];
  relevance_score?: number;
}

// Define sort options
type SortOption = 'weight' | 'date' | 'relevance';

const MemoryApp: React.FC = () => {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [narrative, setNarrative] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [memoryType, setMemoryType] = useState<'user' | 'public'>('user');
  const [highlightedKeywords, setHighlightedKeywords] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState<SortOption>('weight');
  const [resetMessage, setResetMessage] = useState<string | null>(null);

  const api = axios.create({
    baseURL: process.env.REACT_APP_BACKEND_URL || 'http://localhost:8000',
    timeout: 15000,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
  });

  // Updated getThumbnailUrl function
  const getThumbnailUrl = (memory: Memory): string => {
    // Use the image_url provided by the backend if available
    if (memory.image_url) {
      const apiUrl = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8000';
      return `${apiUrl}${memory.image_url}`;
    }
    
    // Fallback if image_url is not provided
    if (!memory.filename) {
      console.log('No filename found, using placeholder');
      return '/placeholder-image.jpg';
    }
    
    // Get session ID from URL
    const urlParams = new URLSearchParams(window.location.search);
    const sessionId = urlParams.get('session');
    
    if (!sessionId) {
      console.error('No session ID found in URL');
      return '/placeholder-image.jpg';
    }
    
    // Construct URL with session ID
    const apiUrl = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8000';
    return `${apiUrl}/api/static_content/${sessionId}/${memory.type}/${memory.filename}`;
  };

  const getSessionId = (): string | null => {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('session');
  };

  const handleLocationUpdate = (memoryId: number, newLocation: string, updatedMemory?: any) => {
    setMemories(prevMemories => {
      const updatedMemories = prevMemories.map(memory => {
        if (memory.id === memoryId) {
          if (updatedMemory) {
            // Use the complete updated memory from backend
            return {
              ...memory,
              ...updatedMemory,
              // Ensure compatibility fields
              weight: updatedMemory.impact_weight || memory.weight,
              keywords: updatedMemory.openai_keywords || memory.keywords
            };
          } else {
            // Just update the location
            return {
              ...memory,
              location: newLocation,
              // Update title if it contained the old location
              title: memory.location === 'Unknown Location' 
                ? `${newLocation} - ${memory.date}` 
                : memory.title.replace(memory.location, newLocation)
            };
          }
        }
        return memory;
      });
      return updatedMemories;
    });
  };

  // Function to sort memories client-side
  const sortMemories = (memoriesToSort: Memory[], sortOption: SortOption): Memory[] => {
    return [...memoriesToSort].sort((a, b) => {
      if (sortOption === 'weight') {
        return (b.weight || 1.0) - (a.weight || 1.0);
      } else if (sortOption === 'date') {
        return new Date(b.date).getTime() - new Date(a.date).getTime();
      }
      // relevance option would use the order from the server
      return 0;
    });
  };

  const searchMemories = async () => {
    if (!searchTerm.trim()) {
      setError('Please enter a search term');
      return;
    }
    setLoading(true);
    setError(null);
  
    try {
      const sessionId = getSessionId();
      
      if (!sessionId) {
        throw new Error('No session ID found. Please start over from the upload page.');
      }
  
      const response = await api.get('/api/memories/search', {
        params: { 
          session_id: sessionId,
          query: searchTerm, 
          memory_type: memoryType,
          sort_by: sortBy
        },
      });
      setMemories(response.data);
    } catch (err) {
      console.error('Search error', err);
      setError(err instanceof Error ? err.message : 'An unknown error occurred');
    } finally {
      setLoading(false);
    }
  };
  
  // Update the generateNarrative function to use the helper
  const generateNarrative = async () => {
    if (!searchTerm.trim()) {
      setError('Please enter a search term');
      return;
    }
    setLoading(true);
    setError(null);
  
    try {
      const sessionId = getSessionId();
      
      if (!sessionId) {
        throw new Error('No session ID found. Please start over from the upload page.');
      }
  
      const response = await api.get('/api/memories/narrative', {
        params: { 
          session_id: sessionId,
          query: searchTerm, 
          memory_type: memoryType
        },
      });
      
      console.log('Narrative response:', response.data); // Debug log
      
      // Handle different possible response structures
      const narrativeData = response.data;
      
      // Set the narrative text
      if (narrativeData.narrative_text) {
        setNarrative(narrativeData.narrative_text);
      } else if (narrativeData.text) {
        setNarrative(narrativeData.text);
      } else {
        setNarrative('');
      }
  
      // Handle keywords with defensive programming
      let keywords = [];
      if (narrativeData.keywords && Array.isArray(narrativeData.keywords)) {
        keywords = narrativeData.keywords
          .filter(kw => kw && (typeof kw === 'string' || (kw.type === 'primary')))
          .map(kw => typeof kw === 'string' ? kw : kw.text);
      }
  
      setHighlightedKeywords(keywords);
    } catch (err) {
      console.error('Narrative generation error', err);
      setError(err instanceof Error ? err.message : 'An unknown error occurred');
    } finally {
      setLoading(false);
    }
  };

  const highlightNarrative = () => {
    if (!narrative) return narrative;

    let highlightedText = narrative;

    highlightedKeywords.forEach((keyword) => {
      const regex = new RegExp(`\\b${keyword}\\b`, 'gi');
      highlightedText = highlightedText.replace(
        regex,
        `<span class="text-red-600 font-bold">${keyword}</span>`
      );
    });

    return DOMPurify.sanitize(highlightedText);
  };

  const handleIncreaseWeight = async (memory_id: number, event: React.MouseEvent) => {
    event.preventDefault();
    
    const sessionId = getSessionId();
    if (!sessionId) {
      setError('No session ID found. Please start over from the upload page.');
      return;
    }
    
    try {
      const response = await api.post(`/api/memories/${memory_id}/adjust_weight`, null, {
        params: {
          session_id: sessionId,
          adjustment: 0.1
        }
      });
      
      // Update BOTH weight fields to maintain compatibility
      setMemories(prevMemories => {
        const updatedMemories = prevMemories.map(memory => 
          memory.id === memory_id 
            ? { 
                ...memory, 
                weight: response.data.new_weight,  // For compatibility
                impact_weight: response.data.new_weight  // Primary field
              } 
            : memory
        );
        return sortMemories(updatedMemories, sortBy);
      });
      
      console.log(`Increased weight of memory ${memory_id} to ${response.data.new_weight}`);
    } catch (error) {
      console.error('Error increasing memory weight:', error);
      setError('Failed to increase memory weight');
    }
  };
  
  // Update the handleDecreaseWeight function
  const handleDecreaseWeight = async (memory_id: number, event: React.MouseEvent) => {
    event.preventDefault(); // Prevent the context menu
    
    const sessionId = getSessionId();
    if (!sessionId) {
      setError('No session ID found. Please start over from the upload page.');
      return;
    }
    
    try {
      // Use the correct endpoint structure
      const response = await api.post(`/api/memories/${memory_id}/adjust_weight`, null, {
        params: {
          session_id: sessionId,
          adjustment: -0.1
        }
      });
  
      // Update the memory weight in the local state
      setMemories(prevMemories => {
        // First update the weight of the changed memory
        const updatedMemories = prevMemories.map(memory =>
          memory.id === memory_id
            ? { ...memory, weight: response.data.new_weight }
            : memory
        );
  
        // Then re-sort the memories based on current sort option
        return sortMemories(updatedMemories, sortBy);
      });
  
      console.log(`Decreased weight of memory ${memory_id} to ${response.data.new_weight}`);
    } catch (error) {
      console.error('Error decreasing memory weight:', error);
      setError('Failed to decrease memory weight');
    }
  };

  // Function to handle sort changes
  const handleSortChange = (newSortOption: SortOption) => {
    setSortBy(newSortOption);
    
    // If we already have memories, resort them immediately
    if (memories.length > 0) {
      setMemories(prevMemories => sortMemories(prevMemories, newSortOption));
    }
  };

  const handleResetComplete = (data) => {
    // Set a temporary success message
    if (data.status === 'success') {
      setResetMessage(`Reset ${data.updated_count} memories successfully!`);
      
      // Clear the message after 3 seconds
      setTimeout(() => {
        setResetMessage(null);
      }, 3000);
      
      // If we have current search results, refresh them
      if (searchTerm && memories.length > 0) {
        searchMemories();
      }
    } else {
      setError(data.message || 'Failed to reset weights');
    }
  };


  return (
    <div className="bg-white min-h-screen p-4">
      <div className="container mx-auto max-w-4xl">
        <h1 className="text-3xl font-bold mb-4 text-gray-800">Memory Cartography</h1>
        
        {/* Memory Type Toggle */}
        <div className="flex justify-center mb-4">
          <div className="bg-gray-100 rounded-full p-1 flex">
            <button
              onClick={() => setMemoryType('user')}
              className={`px-4 py-2 rounded-full transition-colors ${
                memoryType === 'user'
                  ? 'bg-gray-400 text-gray-800'
                  : 'text-gray-600 hover:bg-gray-200'
              }`}
            >
              User Memories
            </button>
            <button
              onClick={() => setMemoryType('public')}
              className={`px-4 py-2 rounded-full transition-colors ${
                memoryType === 'public'
                  ? 'bg-gray-400 text-gray-800'
                  : 'text-gray-600 hover:bg-gray-200'
              }`}
            >
              Public Memories
            </button>
          </div>
        </div>
        
        {/* Search Bar and Reset Button*/}
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={`Search ${memoryType} memories...`}
            className="flex-grow p-2 border rounded bg-white text-gray-800"
            onKeyPress={(e) => e.key === 'Enter' && searchMemories()}
          />
          
          <div className="flex flex-wrap gap-2">
            <button
              onClick={searchMemories}
              disabled={loading}
              className="bg-gray-200 text-gray-800 p-2 rounded disabled:opacity-50"
            >
              {loading ? 'Searching...' : 'Search'}
            </button>
            
            <button
              onClick={generateNarrative}
              disabled={loading}
              className="bg-gray-400 text-gray-800 p-2 rounded disabled:opacity-50"
            >
              {loading ? 'Generating...' : 'Generate Narrative'}
            </button>
            
            {/* Add Reset Weights Button */}
            <ResetWeightsButton 
              memoryType={memoryType}
              onResetComplete={handleResetComplete}
            />
          </div>
        </div>
        
        {/* Reset Success Message */}
        {resetMessage && (
          <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-2 rounded mb-4 text-sm">
            {resetMessage}
          </div>
        )}
        
        {/* Error Handling */}
        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
            <span className="block sm:inline">{error}</span>
          </div>
        )}
  
        {/* Narrative Display */}
        {narrative && (
          <div className="bg-gray-50 p-4 rounded mb-4">
            <h2 className="font-bold mb-2 text-gray-800">Generated Narrative</h2>
            <p
              className="text-gray-800"
              dangerouslySetInnerHTML={{ __html: highlightNarrative() }}
            />
          </div>
        )}
  
        {/* REPLACE the manual memory list rendering with MemoryList component */}
        {loading ? (
          <div className="flex justify-center items-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-gray-500"></div>
          </div>
        ) : (
          <MemoryList
            memories={memories}
            onIncreaseWeight={handleIncreaseWeight}
            onDecreaseWeight={handleDecreaseWeight}
            getThumbnailUrl={getThumbnailUrl}
            onLocationUpdate={handleLocationUpdate}
            sessionId={getSessionId() || ''}
          />
        )}
        
        {/* No results message */}
        {memories.length === 0 && searchTerm && !loading && (
          <div className="text-center py-8 text-gray-500">
            No memories found for "{searchTerm}"
          </div>
        )}
        
        {/* Usage instructions */}
        <div className="mt-4 text-xs text-gray-500 text-center">
          Left-click on a memory to increase its weight • Right-click to decrease weight
          <br />
          Click on any location to edit it
        </div>
      </div>
    </div>
  );
};

export default MemoryApp;