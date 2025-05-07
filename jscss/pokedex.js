document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    const detailsPanel = document.getElementById('details-panel');
    const listPanel = document.querySelector('.list-panel');
    const searchInput = document.getElementById('search-input');
    const typeFiltersContainer = document.getElementById('type-filters');
    const pokemonGrid = document.getElementById('pokemon-grid');
    const favoritesFilterButton = document.getElementById('favorites-filter-button');
    const pokedexContainerEl = document.querySelector('.pokedex-container');
    const siteHeaderEl = document.querySelector('.site-header');

    // --- Constants ---
    const initialPlaceholderHTML = '<div class="details-placeholder"><p>Select a Pokémon from the list to see its details.</p></div>';
    const pokeApiBaseUrl = 'https://pokeapi.co/api/v2/';
    const POKEMON_COUNT_TO_LOAD = 151;
    const NEW_PLACEHOLDER_IMAGE_PATH = 'placeholderbg.png';
    const FAVORITE_POKEMON_IDENTIFIERS = [
        'charizard', 6, 'gengar', 94, 'alakazam', 'mewtwo', 150, 'dragonite'
    ].map(id => id.toString().toLowerCase());
    const MOBILE_BREAKPOINT = 900;

    // --- State Variables ---
    let allPokemonData = [];
    let currentlyDisplayedPokemon = null;
    let activeTypeFilter = 'all';
    let currentSpecialFilter = null;
    let headerSearchContainerEl = null;
    let headerSearchInputEl = null;


    if (detailsPanel && detailsPanel.innerHTML.trim() === '') {
        detailsPanel.innerHTML = initialPlaceholderHTML;
    }

    // --- Helper Functions ---
    const capitalize = (str) => {
        if (!str) return '';
        const namePart = str.split('-')[0];
        return namePart.charAt(0).toUpperCase() + namePart.slice(1);
    };
    const formatId = (id) => `#${id.toString().padStart(3, '0')}`;

    // --- API Fetching ---
    async function fetchJson(url) {
        try {
            const response = await fetch(url);
            if (!response.ok) {
                console.error(`HTTP error! Status: ${response.status} for URL: ${url}`);
                return null;
            }
            return await response.json();
        } catch (error) {
            console.error("Failed to fetch or parse JSON:", url, error);
            return null;
        }
    }

    async function fetchPokemonData(identifier) {
        const pokemonUrl = `${pokeApiBaseUrl}pokemon/${identifier.toString().toLowerCase()}`;
        const pokemon = await fetchJson(pokemonUrl);
        if (!pokemon) return null;
        if (pokemon.species && pokemon.species.url) {
            const species = await fetchJson(pokemon.species.url);
            pokemon.speciesData = species;
            pokemon.evolutionChainUrl = species?.evolution_chain?.url ?? null;
        } else {
            pokemon.speciesData = null;
            pokemon.evolutionChainUrl = null;
        }
        return pokemon;
    }

    async function fetchInitialPokemonList() {
        if (pokemonGrid) pokemonGrid.innerHTML = '<p class="list-loading">Loading Pokémon list...</p>';
        const listUrl = `${pokeApiBaseUrl}pokemon?limit=${POKEMON_COUNT_TO_LOAD}&offset=0`;
        const pokemonListResponse = await fetchJson(listUrl);

        if (!pokemonListResponse || !pokemonListResponse.results) {
            if (pokemonGrid) pokemonGrid.innerHTML = '<p class="list-loading error">Could not fetch Pokémon list.</p>';
            return;
        }

        const promises = pokemonListResponse.results.map(p => fetchPokemonData(p.name));
        const results = await Promise.all(promises);
        allPokemonData = results.filter(data => data !== null);

        if (pokemonGrid) pokemonGrid.innerHTML = '';
        if (allPokemonData.length === 0 && POKEMON_COUNT_TO_LOAD > 0) {
             if (pokemonGrid) pokemonGrid.innerHTML = '<p class="list-loading error">Could not load Pokémon details.</p>';
        }
    }

    // --- DOM Manipulation & Display ---
    function createPokemonListCard(pokemon) {
        const card = document.createElement('div');
        card.className = 'pokemon-list-card';
        card.dataset.pokemonId = pokemon.id;

        const displayName = capitalize(pokemon.name);
        const displayId = formatId(pokemon.id);
        const hasSprite = !!pokemon.sprites?.front_default;
        const imageUrl = pokemon.sprites?.front_default || NEW_PLACEHOLDER_IMAGE_PATH;

        card.innerHTML = `
            <span class="list-card-id">${displayId}</span>
            <img src="${imageUrl}" alt="${displayName}" loading="lazy" class="${!hasSprite ? 'is-placeholder' : ''}">
            <span class="list-card-name">${displayName}</span>
        `;
        card.addEventListener('click', () => {
            document.querySelectorAll('.pokemon-list-card.selected').forEach(c => c.classList.remove('selected'));
            card.classList.add('selected');
            displayPokemonDetails(pokemon);
        });
        return card;
    }

    function populatePokemonGrid(pokemonList) {
        if (!pokemonGrid) return;
        pokemonGrid.innerHTML = '';

        if (!pokemonList || pokemonList.length === 0) {
            pokemonGrid.innerHTML = '<p class="list-loading">No Pokémon match your criteria.</p>';
            return;
        }
        pokemonList.forEach(pokemon => {
            const card = createPokemonListCard(pokemon);
            pokemonGrid.appendChild(card);
        });
    }

    function populateTypeFilters() {
        if (!typeFiltersContainer) return;
        const types = new Set();
        allPokemonData.forEach(pokemon => {
            pokemon.types?.forEach(typeInfo => types.add(typeInfo.type.name));
        });

        const existingButtons = typeFiltersContainer.querySelectorAll('.type-filter-button:not([data-type="all"])');
        existingButtons.forEach(btn => btn.remove());

        const allButton = typeFiltersContainer.querySelector('button[data-type="all"]');
        if (allButton) {
            allButton.removeEventListener('click', handleTypeFilterClick);
            allButton.addEventListener('click', handleTypeFilterClick);
            allButton.classList.toggle('active', activeTypeFilter === 'all' && !currentSpecialFilter);
        }

        Array.from(types).sort().forEach(type => {
            const button = document.createElement('button');
            button.className = 'type-filter-button';
            button.dataset.type = type;
            button.textContent = capitalize(type);
            button.addEventListener('click', handleTypeFilterClick);
            button.classList.toggle('active', activeTypeFilter === type && !currentSpecialFilter);
            typeFiltersContainer.appendChild(button);
        });
    }

    function getStatColorClass(value) {
        if (value < 60) return 'low';
        if (value < 100) return 'medium';
        return 'high';
    }

    async function displayPokemonDetails(pokemon) {
        if (!detailsPanel) return;
        const existingPlaceholder = detailsPanel.querySelector('.details-placeholder');
        if (existingPlaceholder) existingPlaceholder.remove();

        if (!pokemon || typeof pokemon !== 'object') {
            detailsPanel.innerHTML = '<div class="details-placeholder error"><p>Could not load Pokémon data.</p></div>';
            currentlyDisplayedPokemon = null; 
            setMobileViewingState(false); 
            return;
        }
        currentlyDisplayedPokemon = pokemon;

        const name = capitalize(pokemon.name);
        const id = formatId(pokemon.id);
        const hasOfficialArtwork = !!pokemon.sprites?.other?.['official-artwork']?.front_default;
        const hasDefaultSprite = !!pokemon.sprites?.front_default;
        let imageUrl = NEW_PLACEHOLDER_IMAGE_PATH;
        let isMainImagePlaceholder = true;

        if (hasOfficialArtwork) {
            imageUrl = pokemon.sprites.other['official-artwork'].front_default;
            isMainImagePlaceholder = false;
        } else if (hasDefaultSprite) {
            imageUrl = pokemon.sprites.front_default;
            isMainImagePlaceholder = false;
        }

        const types = pokemon.types?.map(typeInfo => typeInfo.type.name) ?? [];
        const weight = pokemon.weight ? (pokemon.weight / 10).toFixed(1) : '?';
        const height = pokemon.height ? (pokemon.height / 10).toFixed(1) : '?';
        const abilities = pokemon.abilities?.map(abilityInfo =>
            capitalize(abilityInfo.ability.name.replace('-', ' '))
        ).join(', ') ?? 'Unknown';

        const maxStatValue = 255;
        const statsHtml = pokemon.stats?.map(statInfo => {
            if (!statInfo.stat?.name) return '';
            const statName = capitalize(statInfo.stat.name.replace('-', ' '));
            const statValue = statInfo.base_stat;
            const statPercentage = Math.max(0, Math.min(100, (statValue / maxStatValue) * 100));
            const colorClass = getStatColorClass(statValue);
            return `
                <div class="stat-item">
                    <span class="stat-label">${statName}</span>
                    <span class="stat-value">${statValue}</span>
                    <div class="stat-bar-container">
                        <div class="stat-bar-fill ${colorClass}" style="width: ${statPercentage}%;"></div>
                    </div>
                </div>`;
        }).join('') ?? '<p>Stats data unavailable.</p>';

        const movesHtml = pokemon.moves?.slice(0, 8).map(moveInfo => {
            if (!moveInfo.move?.name) return '';
            return `<li>${capitalize(moveInfo.move.name.replace('-', ' '))}</li>`;
        }).join('') || '<li>No moves data available.</li>';

        const typesHtml = types.map(type =>
            `<span class="type-badge type-${type}">${capitalize(type)}</span>`
        ).join('');

        detailsPanel.innerHTML = `
            <div class="details-header">
                <button type="button" class="details-back-button" id="details-back-button">← Back</button>
                <h2>${name}</h2>
                <span class="pokemon-id">${id}</span>
            </div>
            <img src="${imageUrl}" alt="${name}" class="pokemon-main-image ${isMainImagePlaceholder ? 'is-placeholder' : ''}" loading="lazy">
            <div class="details-body">
                <div class="details-types">${typesHtml}</div>
                <h3 class="details-section-title">About</h3>
                <div class="details-about">
                    <div class="about-item"><span class="about-label">Weight</span><strong>${weight} kg</strong></div>
                    <div class="about-item"><span class="about-label">Height</span><strong>${height} m</strong></div>
                    <div class="about-item ability-item"><span class="about-label">Abilities</span><strong>${abilities}</strong></div>
                </div>
                <h3 class="details-section-title">Base Stats</h3><div class="details-stats">${statsHtml}</div>
                <h3 class="details-section-title">Sample Moves</h3><div class="details-moves"><ul>${movesHtml}</ul></div>
                <h3 class="details-section-title">Evolution Chain</h3><div class="details-evolution" id="evolution-chain-container"></div>
            </div>`;
        
        const backButton = document.getElementById('details-back-button');
        if (backButton) {
            backButton.addEventListener('click', handleGoBackClick);
        }

        const evoContainer = document.getElementById('evolution-chain-container');
        if (pokemon.evolutionChainUrl && evoContainer) {
            await fetchAndDisplayEvolution(pokemon.evolutionChainUrl, evoContainer);
        } else if (evoContainer) {
            evoContainer.innerHTML = '<span>Evolution data unavailable.</span>';
        }
        detailsPanel.scrollTop = 0;
        setMobileViewingState(true); 
    }

    async function fetchAndDisplayEvolution(evolutionChainUrl, container) {
        if (!container) return;
        container.innerHTML = '<span>Loading evolution...</span>';
        const evolutionData = await fetchJson(evolutionChainUrl);

        if (!evolutionData?.chain) {
            container.innerHTML = '<span>Could not load evolution data.</span>';
            return;
        }

        const evolutionStagesNames = [];
        let currentStage = evolutionData.chain;
        try {
            while (currentStage) {
                if (currentStage.species?.name) evolutionStagesNames.push(currentStage.species.name);
                currentStage = currentStage.evolves_to?.[0];
            }
        } catch (error) {
            container.innerHTML = '<span>Error processing evolution data.</span>';
            return;
        }

        if (evolutionStagesNames.length <= 1) {
            container.innerHTML = '<span>This Pokémon does not evolve further.</span>';
            return;
        }

        const evolutionPokemonPromises = evolutionStagesNames.map(name => fetchJson(`${pokeApiBaseUrl}pokemon/${name}`));
        const evolutionResultsSettled = await Promise.allSettled(evolutionPokemonPromises);

        container.innerHTML = '';
        let evolutionDisplayed = false;

        evolutionResultsSettled.forEach((result, index) => {
            if (result.status === 'fulfilled' && result.value) {
                const evoPokemon = result.value;
                const stageDiv = document.createElement('div');
                stageDiv.className = 'evolution-stage';
                const evoName = capitalize(evoPokemon.name);
                const hasEvoSprite = !!evoPokemon.sprites?.front_default;
                const evoSprite = evoPokemon.sprites?.front_default || NEW_PLACEHOLDER_IMAGE_PATH;
                stageDiv.innerHTML = `
                    <img src="${evoSprite}" alt="${evoName}" loading="lazy" class="${!hasEvoSprite ? 'is-placeholder' : ''}">
                    <span>${evoName}</span>`;
                stageDiv.addEventListener('click', async () => {
                    const fullEvoData = await fetchPokemonData(evoPokemon.name);
                    if (fullEvoData) {
                         displayPokemonDetails(fullEvoData);
                         const correspondingCard = pokemonGrid?.querySelector(`.pokemon-list-card[data-pokemon-id="${fullEvoData.id}"]`);
                         if (correspondingCard) {
                            document.querySelectorAll('.pokemon-list-card.selected').forEach(c => c.classList.remove('selected'));
                            correspondingCard.classList.add('selected');
                            correspondingCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                         }
                    }
                });
                container.appendChild(stageDiv);
                evolutionDisplayed = true;
                if (index < evolutionResultsSettled.length - 1 && evolutionResultsSettled[index + 1].status === 'fulfilled') {
                    const arrowSpan = document.createElement('span');
                    arrowSpan.className = 'evolution-arrow';
                    arrowSpan.innerHTML = '→';
                    container.appendChild(arrowSpan);
                }
            } else {
                 const errorDiv = document.createElement('div');
                 errorDiv.className = 'evolution-stage error-stage';
                 errorDiv.innerHTML = '<span>?</span><span>Error</span>';
                 container.appendChild(errorDiv);
                 if (index < evolutionResultsSettled.length - 1) {
                     const errorArrowSpan = document.createElement('span');
                     errorArrowSpan.className = 'evolution-arrow faded';
                     errorArrowSpan.innerHTML = '→';
                     container.appendChild(errorArrowSpan);
                 }
            }
        });
        if (!evolutionDisplayed && evolutionStagesNames.length > 1) container.innerHTML = '<span>Could not display evolution details.</span>';
    }

    // --- Filtering and Event Handling ---
    function updateActiveButtonStates() {
        if (!typeFiltersContainer) return;
        typeFiltersContainer.querySelectorAll('.type-filter-button').forEach(button => {
            button.classList.toggle('active', button.dataset.type === activeTypeFilter && !currentSpecialFilter);
        });
        if (favoritesFilterButton) {
            favoritesFilterButton.classList.toggle('active', currentSpecialFilter === 'favorites');
        }
    }

    function handleTypeFilterClick(event) {
        const clickedButton = event.target.closest('button');
        if (!clickedButton || !clickedButton.dataset.type) return;
        activeTypeFilter = clickedButton.dataset.type;
        currentSpecialFilter = null;
        updateActiveButtonStates();
        filterAndDisplayPokemonList();
    }

    function handleFavoritesFilterClick() {
        if (currentSpecialFilter === 'favorites') {
            currentSpecialFilter = null;
            activeTypeFilter = 'all';
        } else {
            currentSpecialFilter = 'favorites';
            activeTypeFilter = 'all';
        }
        if (searchInput) searchInput.value = '';
        updateActiveButtonStates();
        filterAndDisplayPokemonList();
    }

    function filterAndDisplayPokemonList() {
        if (!allPokemonData) return;
        const searchTerm = searchInput ? searchInput.value.toLowerCase().trim() : '';
        let listToDisplay = allPokemonData;

        if (currentSpecialFilter === 'favorites') {
            listToDisplay = listToDisplay.filter(pokemon =>
                FAVORITE_POKEMON_IDENTIFIERS.includes(pokemon.name.toLowerCase()) ||
                FAVORITE_POKEMON_IDENTIFIERS.includes(pokemon.id.toString())
            );
        }
        if (currentSpecialFilter !== 'favorites' && activeTypeFilter !== 'all') {
             listToDisplay = listToDisplay.filter(pokemon =>
                pokemon.types?.some(typeInfo => typeInfo.type.name === activeTypeFilter)
            );
        }
        if (searchTerm !== '') {
            listToDisplay = listToDisplay.filter(pokemon => {
                const nameMatch = pokemon.name.toLowerCase().includes(searchTerm);
                const idMatch = pokemon.id.toString() === searchTerm || formatId(pokemon.id) === searchTerm;
                return nameMatch || idMatch;
            });
        }
        populatePokemonGrid(listToDisplay);

        if (currentlyDisplayedPokemon) {
             const isDisplayedPokemonInFilteredList = listToDisplay.some(p => p.id === currentlyDisplayedPokemon.id);
             const selectedPokemonCardInGrid = pokemonGrid?.querySelector('.pokemon-list-card.selected');
             if (isDisplayedPokemonInFilteredList) {
                 const cardForCurrentPokemon = pokemonGrid?.querySelector(`.pokemon-list-card[data-pokemon-id="${currentlyDisplayedPokemon.id}"]`);
                 if (cardForCurrentPokemon && !cardForCurrentPokemon.classList.contains('selected')) {
                      if(selectedPokemonCardInGrid) selectedPokemonCardInGrid.classList.remove('selected');
                      cardForCurrentPokemon.classList.add('selected');
                 }
             } else {
                 if (selectedPokemonCardInGrid) selectedPokemonCardInGrid.classList.remove('selected');
                 if (detailsPanel) detailsPanel.innerHTML = initialPlaceholderHTML;
                 currentlyDisplayedPokemon = null;
                 if (window.innerWidth <= MOBILE_BREAKPOINT && pokedexContainerEl && pokedexContainerEl.classList.contains('is-mobile-viewing')) {
                    setMobileViewingState(false);
                 }
             }
        } else {
             const selectedPokemonCardInGrid = pokemonGrid?.querySelector('.pokemon-list-card.selected');
             if (selectedPokemonCardInGrid) selectedPokemonCardInGrid.classList.remove('selected');
        }
    }

    // --- Mobile View Specific Functions ---
    async function fetchAndDisplayPokemonFromHeaderSearch(query) {
        if (!query) return;
        const pokemonData = await fetchPokemonData(query);
        if (pokemonData) {
            displayPokemonDetails(pokemonData);
            const cardInGrid = pokemonGrid?.querySelector(`.pokemon-list-card[data-pokemon-id="${pokemonData.id}"]`);
            if (cardInGrid) {
                document.querySelectorAll('.pokemon-list-card.selected').forEach(c => c.classList.remove('selected'));
                cardInGrid.classList.add('selected');
            }
        } else {
            if (headerSearchInputEl) headerSearchInputEl.value = `Not found: ${query}`;
            setTimeout(() => { if(headerSearchInputEl) headerSearchInputEl.value = ''; }, 2000);
        }
    }

    function setupHeaderSearch() {
        if (!siteHeaderEl || headerSearchContainerEl) return;

        headerSearchContainerEl = document.createElement('div');
        headerSearchContainerEl.className = 'header-search-container';

        headerSearchInputEl = document.createElement('input');
        headerSearchInputEl.type = 'search';
        headerSearchInputEl.className = 'header-search-input';
        headerSearchInputEl.placeholder = 'Search by Name/ID...';
        headerSearchInputEl.setAttribute('aria-label', 'Search Pokémon in header');

        headerSearchInputEl.addEventListener('keypress', async (event) => {
            if (event.key === 'Enter' && headerSearchInputEl.value.trim() !== '') {
                const query = headerSearchInputEl.value.trim().toLowerCase();
                await fetchAndDisplayPokemonFromHeaderSearch(query);
            }
        });
        headerSearchContainerEl.appendChild(headerSearchInputEl);
        const headerTitle = siteHeaderEl.querySelector('h1');
        if (headerTitle && headerTitle.nextSibling) {
            siteHeaderEl.insertBefore(headerSearchContainerEl, headerTitle.nextSibling);
        } else if (headerTitle) {
            headerTitle.insertAdjacentElement('afterend', headerSearchContainerEl);
        } else {
            siteHeaderEl.appendChild(headerSearchContainerEl);
        }
    }

    function setMobileViewingState(isViewingPokemon) {
        if (!pokedexContainerEl || !siteHeaderEl) return;
        const isMobile = window.innerWidth <= MOBILE_BREAKPOINT;

        if (isMobile && isViewingPokemon) {
            pokedexContainerEl.classList.add('is-mobile-viewing');
            siteHeaderEl.classList.add('has-search');
            if (headerSearchInputEl) {
                headerSearchInputEl.value = ''; 
            }
        } else {
            pokedexContainerEl.classList.remove('is-mobile-viewing');
            siteHeaderEl.classList.remove('has-search');
        }
    }

    function handleGoBackClick() {
        setMobileViewingState(false); 

        if (detailsPanel) {
            detailsPanel.innerHTML = initialPlaceholderHTML;
        }
        currentlyDisplayedPokemon = null;

        const selectedCards = pokemonGrid ? pokemonGrid.querySelectorAll('.pokemon-list-card.selected') : [];
        selectedCards.forEach(card => card.classList.remove('selected'));
    }

    // --- Initialization ---
    async function initializePokedex() {
        if (detailsPanel && detailsPanel.innerHTML.trim() === '') {
            detailsPanel.innerHTML = initialPlaceholderHTML;
        }
        await fetchInitialPokemonList();
        if (allPokemonData.length > 0) {
            populateTypeFilters();
            filterAndDisplayPokemonList();
            updateActiveButtonStates();
            if (searchInput) {
                searchInput.addEventListener('input', () => {
                    filterAndDisplayPokemonList();
                });
            }
            if (favoritesFilterButton) {
                favoritesFilterButton.addEventListener('click', handleFavoritesFilterClick);
            }
        } else {
            console.log("No Pokémon data loaded to initialize further UI components.");
        }

        if (window.innerWidth <= MOBILE_BREAKPOINT) {
            if (siteHeaderEl && !headerSearchContainerEl) setupHeaderSearch();
        }
        
        const isInitiallyViewing = currentlyDisplayedPokemon && detailsPanel && !detailsPanel.querySelector('.details-placeholder');
        setMobileViewingState(isInitiallyViewing);

        window.addEventListener('resize', () => {
            const isMobileNow = window.innerWidth <= MOBILE_BREAKPOINT;
            if (isMobileNow) {
                if (siteHeaderEl && !headerSearchContainerEl) setupHeaderSearch();
            }
            const isViewingAPokemon = currentlyDisplayedPokemon && detailsPanel && !detailsPanel.querySelector('.details-placeholder');
            setMobileViewingState(isViewingAPokemon);
        });

        const siteTitleEl = siteHeaderEl ? siteHeaderEl.querySelector('h1') : null;
        if (siteTitleEl) {
            siteTitleEl.addEventListener('click', () => {
                const isMobile = window.innerWidth <= MOBILE_BREAKPOINT;
                if (isMobile && pokedexContainerEl && pokedexContainerEl.classList.contains('is-mobile-viewing')) {
                    handleGoBackClick();
                }
            });
        }
        console.log("Pokedex Initialized.");
    }
    initializePokedex();
});