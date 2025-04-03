import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Persona, CategoryType } from '@/lib/types';
import { categories } from '@/lib/historical-personas';
import { History } from 'lucide-react';

interface SidebarProps {
  activePersonaId: number | undefined;
  onPersonaSelect: (persona: Persona) => void;
  isMobile: boolean;
  isOpen: boolean;
  onToggle: () => void;
}

export function Sidebar({ 
  activePersonaId, 
  onPersonaSelect, 
  isMobile, 
  isOpen, 
  onToggle 
}: SidebarProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<CategoryType>('All');

  const queryClient = useQueryClient();

  // Get all personas from API
  const { data: personas = [], isLoading } = useQuery({
    queryKey: ['/api/personas'],
    staleTime: 60000 // 1 minute
  });

  // Search personas with debounce
  useEffect(() => {
    const handler = setTimeout(() => {
      queryClient.invalidateQueries({ queryKey: ['/api/personas/search'] });
    }, 500);

    return () => {
      clearTimeout(handler);
    };
  }, [searchQuery, queryClient]);

  // Filter personas based on search and category
  const filteredPersonas = personas.filter((persona: Persona) => {
    const matchesSearch = searchQuery === '' || 
      persona.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      persona.description.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesCategory = selectedCategory === 'All' || persona.category === selectedCategory;
    
    return matchesSearch && matchesCategory;
  });

  // Sidebar class calculation
  const sidebarClass = `
    w-full md:w-80 bg-white border-r border-neutral-medium flex flex-col z-20 
    transition-all duration-300 ease-in-out overflow-hidden
    ${isMobile ? (isOpen ? 'h-screen absolute top-0 left-0' : 'h-20') : 'h-full'}
  `;

  return (
    <div className={sidebarClass}>
      {/* App Header */}
      <div className="flex justify-between items-center p-4 border-b border-neutral-medium">
        <h1 className="text-xl font-semibold text-neutral-darkest flex items-center">
          <History className="mr-2 text-primary h-5 w-5" />
          Persona Chat
        </h1>
        {isMobile && (
          <button 
            onClick={onToggle} 
            className="md:hidden text-neutral-dark hover:text-primary focus:outline-none"
          >
            <span className="material-icons">
              {isOpen ? 'expand_less' : 'expand_more'}
            </span>
          </button>
        )}
      </div>

      {/* Persona Search */}
      <div className="p-4 border-b border-neutral-medium">
        <div className="relative">
          <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-neutral-dark">
            <span className="material-icons text-sm">search</span>
          </span>
          <input 
            type="text" 
            placeholder="Search personas..." 
            className="w-full pl-10 pr-4 py-2 border border-neutral-medium rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Persona Categories */}
      <div className="p-4 border-b border-neutral-medium">
        <h2 className="font-medium text-sm uppercase tracking-wider text-neutral-dark mb-2">
          Categories
        </h2>
        <div className="flex flex-wrap gap-2">
          {categories.map((category) => (
            <button
              key={category}
              className={`px-3 py-1 text-xs ${
                selectedCategory === category
                  ? 'bg-primary text-white'
                  : 'bg-neutral-light text-neutral-darkest hover:bg-neutral-medium'
              } rounded-full focus:outline-none focus:ring-2 focus:ring-primary`}
              onClick={() => setSelectedCategory(category as CategoryType)}
            >
              {category}
            </button>
          ))}
        </div>
      </div>

      {/* Persona List */}
      <div className="overflow-y-auto flex-grow">
        {isLoading ? (
          <div className="p-4 text-center text-neutral-dark">Loading personas...</div>
        ) : filteredPersonas.length === 0 ? (
          <div className="p-4 text-center text-neutral-dark">No personas found</div>
        ) : (
          <div className="divide-y divide-neutral-medium">
            {filteredPersonas.map((persona: Persona) => (
              <div
                key={persona.id}
                className={`p-3 flex items-center hover:bg-neutral-light cursor-pointer ${
                  activePersonaId === persona.id
                    ? 'bg-primary-light/10 border-l-4 border-primary'
                    : ''
                }`}
                onClick={() => onPersonaSelect(persona)}
              >
                <div className={`flex-shrink-0 w-12 h-12 rounded-full bg-neutral-medium overflow-hidden ${
                  activePersonaId === persona.id ? 'border-2 border-primary' : ''
                }`}>
                  <img
                    src={persona.imageUrl}
                    alt={persona.name}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="ml-3 flex-grow">
                  <h3 className="font-medium">{persona.name}</h3>
                  <p className="text-xs text-neutral-dark">{persona.lifespan} • {persona.category}</p>
                </div>
                {activePersonaId === persona.id && (
                  <span className="material-icons text-primary">check_circle</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
