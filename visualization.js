// Process the coaching data to create nodes and links for visualization
function processCoachingData() {
    const nodes = [];
    const links = [];
    const nodeMap = new Map(); // Map to track unique nodes
    let nodeId = 0;

    // Helper function to add a node if it doesn't exist
    function addNode(name, type, team = null, position = null) {
        if (!nodeMap.has(name)) {
            const node = {
                id: nodeId++,
                name: name,
                type: type,
                team: team,
                position: position
            };
            nodes.push(node);
            nodeMap.set(name, node);
        }
        return nodeMap.get(name);
    }

    // Helper function to split years into separate terms
    function splitTerms(years) {
        // Handle cases like "2015-2016, 2019-2021"
        return years.split(',').map(term => term.trim());
    }

    // Helper function to parse year range
    function parseYearRange(yearStr) {
        const [start, end] = yearStr.split('-').map(y => parseInt(y.trim()));
        return { start, end: end || start };
    }

    // Helper function to get link order based on years
    function getLinkOrder(years) {
        const { start } = parseYearRange(years);
        return start;
    }

    // Process all teams and their coaching staffs
    Object.entries(team_coach_history).forEach(([teamName, teamData]) => {
        // Add team node
        const teamNode = addNode(teamName, 'team');

        // Process head coaches
        teamData.head_coaches.forEach(coach => {
            const coachNode = addNode(coach.name, 'coach', teamName, 'Head Coach');
            // Split terms and create separate links
            splitTerms(coach.years).forEach(term => {
                const { start, end } = parseYearRange(term);
                links.push({
                    source: coachNode.id,
                    target: teamNode.id,
                    type: 'head_coach',
                    years: term,
                    yearStart: start,
                    yearEnd: end
                });
            });
        });

        // Process coordinators
        teamData.coordinators.forEach(coord => {
            const coordNode = addNode(coord.name, 'coach', teamName, coord.position);
            // Split terms and create separate links
            splitTerms(coord.years).forEach(term => {
                const { start, end } = parseYearRange(term);
                links.push({
                    source: coordNode.id,
                    target: teamNode.id,
                    type: coord.position.toLowerCase().includes('offensive') ? 'offensive' :
                        coord.position.toLowerCase().includes('defensive') ? 'defensive' : 'special_teams',
                    years: term,
                    yearStart: start,
                    yearEnd: end
                });
            });
        });
    });

    return { nodes, links, nodeMap };
}

// Find nodes within a certain distance of the start node
function findNodesWithinDistance(startNode, maxDistance, nodes, links) {
    const distances = new Map();
    const queue = [{ node: startNode, distance: 0 }];
    distances.set(startNode.id, 0);

    // Process queue
    while (queue.length > 0) {
        const current = queue.shift();

        // Skip if we've reached max distance
        if (current.distance >= maxDistance) continue;

        // Find all connected nodes through links
        links.forEach(link => {
            let connectedId = null;

            // Handle both object and primitive source/target
            const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
            const targetId = typeof link.target === 'object' ? link.target.id : link.target;

            // Find the connected node ID
            if (sourceId === current.node.id) {
                connectedId = targetId;
            } else if (targetId === current.node.id) {
                connectedId = sourceId;
            }

            // If we found a connection and haven't visited it yet
            if (connectedId !== null && !distances.has(connectedId)) {
                const connectedNode = nodes.find(n => n.id === connectedId);
                if (connectedNode) {
                    distances.set(connectedId, current.distance + 1);
                    queue.push({
                        node: connectedNode,
                        distance: current.distance + 1
                    });
                }
            }
        });
    }

    return distances;
}

// Initialize the visualization
function initializeVisualization() {
    const container = d3.select('#coachNetwork');
    const width = container.node().getBoundingClientRect().width;
    const height = 600;

    // Clear any existing visualization
    container.selectAll("*").remove();

    // Create SVG
    const svg = container.append("svg")
        .attr("width", width)
        .attr("height", height)
        .attr("viewBox", [0, 0, width, height]);

    // Add zoom behavior
    const g = svg.append("g");
    svg.call(d3.zoom()
        .scaleExtent([0.1, 4])
        .on("zoom", (event) => {
            g.attr("transform", event.transform);
        }));

    return { svg, g, width, height };
}

// Draw the network visualization
function drawNetwork(data) {
    const { svg, g, width, height } = initializeVisualization();
    const { nodes, links } = data || processCoachingData();

    // Create force simulation
    const simulation = d3.forceSimulation(nodes)
        .force("link", d3.forceLink(links)
            .id(d => d.id)
            .distance(150))
        .force("charge", d3.forceManyBody()
            .strength(d => d.type === 'team' ? -1000 : -500)
            .distanceMax(500))
        .force("center", d3.forceCenter(width / 2, height / 2))
        .force("collision", d3.forceCollide()
            .radius(d => getNodeRadius(d) + 15))
        .force("x", d3.forceX(width / 2).strength(0.1))
        .force("y", d3.forceY(height / 2).strength(0.1));

    // Create links with curved paths for multiple terms
    const link = g.append("g")
        .selectAll("path")
        .data(links)
        .join("path")
        .attr("stroke", getLinkColor)
        .attr("stroke-width", getLinkWidth)
        .attr("stroke-opacity", d => {
            const currentYear = new Date().getFullYear();
            return d.yearEnd >= currentYear - 2 ? 0.8 : 0.4;
        })
        .attr("stroke-dasharray", d => {
            const currentYear = new Date().getFullYear();
            return d.yearEnd < currentYear - 2 ? "4,4" : "none";
        })
        .attr("fill", "none")
        .on("mouseover", (event, d) => {
            const tooltip = g.append("text")
                .attr("class", "tooltip")
                .attr("x", (d.source.x + d.target.x) / 2)
                .attr("y", (d.source.y + d.target.y) / 2 - 10)
                .attr("text-anchor", "middle")
                .attr("fill", "#333")
                .style("font-size", "12px")
                .style("pointer-events", "none")
                .text(d.years);

            d3.select(event.currentTarget)
                .attr("stroke-opacity", 1)
                .attr("stroke-width", getLinkWidth(d) + 1);
        })
        .on("mouseout", (event, d) => {
            g.selectAll(".tooltip").remove();
            d3.select(event.currentTarget)
                .attr("stroke-opacity", d => {
                    const currentYear = new Date().getFullYear();
                    return d.yearEnd >= currentYear - 2 ? 0.8 : 0.4;
                })
                .attr("stroke-width", getLinkWidth(d));
        });

    // Create nodes
    const node = g.append("g")
        .selectAll("g")
        .data(nodes)
        .join("g")
        .call(drag(simulation))
        .on("click", (event, d) => {
            if (d.type === 'coach') {
                const coachSelect = document.getElementById('coachSelect');
                coachSelect.value = d.name;
                const teamSelect = document.getElementById('teamSelect');
                teamSelect.value = '';
                updateVisualization(d.name, null);
                updateCoachDetails(d.name);
            } else if (d.type === 'team') {
                const teamSelect = document.getElementById('teamSelect');
                teamSelect.value = d.name;
                const coachSelect = document.getElementById('coachSelect');
                coachSelect.value = '';
                updateVisualization(null, d.name);
                updateTeamDetails(d.name);
            }
        });

    // Add circles to nodes
    node.append("circle")
        .attr("r", getNodeRadius)
        .attr("fill", d => {
            if (d.type === 'coach') return getNodeColor(d);
            const colors = getTeamColors(d.name);
            return colors.primary;
        })
        .attr("stroke", d => {
            if (d.type === 'coach') return '#fff';
            const colors = getTeamColors(d.name);
            return colors.secondary;
        })
        .attr("stroke-width", d => d.type === 'team' ? 4 : 2);

    // Add labels to nodes
    const labels = node.append("text")
        .text(d => d.name)
        .attr("x", 0)
        .attr("y", d => getNodeRadius(d) + 15)
        .attr("text-anchor", "middle")
        .attr("fill", "#333")
        .style("font-size", "12px")
        .style("pointer-events", "none");

    // Add background rectangles for labels
    labels.each(function () {
        const bbox = this.getBBox();
        const padding = 4;
        d3.select(this.parentNode)
            .insert("rect", "text")
            .attr("x", bbox.x - padding)
            .attr("y", bbox.y - padding)
            .attr("width", bbox.width + (padding * 2))
            .attr("height", bbox.height + (padding * 2))
            .attr("fill", "white")
            .attr("fill-opacity", 0.8)
            .style("pointer-events", "none");
    });

    // Update positions on tick
    simulation.on("tick", () => {
        link.attr("d", d => {
            const dx = d.target.x - d.source.x;
            const dy = d.target.y - d.source.y;
            const dr = Math.sqrt(dx * dx + dy * dy);

            // Get all links between these nodes to calculate offset
            const sameNodes = links.filter(l =>
                (l.source.id === d.source.id && l.target.id === d.target.id) ||
                (l.source.id === d.target.id && l.target.id === d.source.id)
            ).sort((a, b) => a.yearStart - b.yearStart);

            const linkIndex = sameNodes.indexOf(d);
            const total = sameNodes.length;

            // Calculate curve offset based on chronological order
            const baseOffset = 20;
            const offset = total === 1 ? 0 : (linkIndex - (total - 1) / 2) * baseOffset;

            if (offset === 0) {
                return `M${d.source.x},${d.source.y}L${d.target.x},${d.target.y}`;
            } else {
                const midX = (d.source.x + d.target.x) / 2;
                const midY = (d.source.y + d.target.y) / 2;
                const normalX = -dy / dr;
                const normalY = dx / dr;
                const midXOffset = midX + normalX * offset;
                const midYOffset = midY + normalY * offset;
                return `M${d.source.x},${d.source.y}Q${midXOffset},${midYOffset},${d.target.x},${d.target.y}`;
            }
        });

        node
            .attr("transform", d => `translate(${d.x},${d.y})`);

        // Keep nodes within bounds
        nodes.forEach(d => {
            d.x = Math.max(50, Math.min(width - 50, d.x));
            d.y = Math.max(50, Math.min(height - 50, d.y));
        });
    });

    // Handle window resize
    window.addEventListener('resize', () => {
        const newWidth = d3.select('#coachNetwork').node().getBoundingClientRect().width;
        svg.attr("width", newWidth);
        simulation.force("center", d3.forceCenter(newWidth / 2, height / 2));
        simulation.alpha(0.3).restart();
    });

    return simulation;
}

// Update visualization based on selection
function updateVisualization(selectedCoach, selectedTeam) {
    // Get the current distance value, default to 2 if not set
    const maxDistance = parseInt(document.getElementById('distanceSlider')?.value || '2');
    let filteredData;

    if (selectedCoach) {
        filteredData = filterDataByCoach(selectedCoach, maxDistance);
    } else if (selectedTeam) {
        filteredData = filterDataByTeam(selectedTeam, maxDistance);
    } else {
        filteredData = processCoachingData();
    }

    // Clear existing visualization
    d3.select('#coachNetwork').selectAll("*").remove();

    // Draw new visualization
    drawNetwork(filteredData);
}

function filterDataByCoach(coachName, maxDistance) {
    const { nodes, links } = processCoachingData();
    const startNode = nodes.find(n => n.name === coachName);

    if (!startNode) return { nodes, links };

    // Get distances for all reachable nodes
    const distances = findNodesWithinDistance(startNode, maxDistance, nodes, links);

    // Filter nodes within maxDistance
    const filteredNodes = nodes.filter(node => {
        const distance = distances.get(node.id);
        return distance !== undefined && distance <= maxDistance;
    });

    // Filter links where both ends are in our filtered nodes
    const nodeIds = new Set(filteredNodes.map(n => n.id));
    const filteredLinks = links.filter(link => {
        const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
        const targetId = typeof link.target === 'object' ? link.target.id : link.target;
        return nodeIds.has(sourceId) && nodeIds.has(targetId);
    });

    return { nodes: filteredNodes, links: filteredLinks };
}

function filterDataByTeam(teamName, maxDistance) {
    const { nodes, links } = processCoachingData();
    const teamNode = nodes.find(n => n.name === teamName);

    if (!teamNode) return { nodes, links };

    // Get distances for all reachable nodes
    const distances = findNodesWithinDistance(teamNode, maxDistance, nodes, links);

    // Filter nodes within maxDistance
    const filteredNodes = nodes.filter(node => {
        const distance = distances.get(node.id);
        return distance !== undefined && distance <= maxDistance;
    });

    // Filter links where both ends are in our filtered nodes
    const nodeIds = new Set(filteredNodes.map(n => n.id));
    const filteredLinks = links.filter(link => {
        const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
        const targetId = typeof link.target === 'object' ? link.target.id : link.target;
        return nodeIds.has(sourceId) && nodeIds.has(targetId);
    });

    return { nodes: filteredNodes, links: filteredLinks };
}

// Find all possible connections between teams
function findAllConnections(team1, team2, initialMaxDistance = 3) {
    // Get the processed data first
    const { nodes, links } = processCoachingData();

    // Track results
    const resultNodes = new Set();
    const resultLinks = new Set();
    const paths = [];

    // Create a graph representation
    const graph = new Map();
    const nodeMap = new Map();

    // Initialize nodes with unique IDs
    nodes.forEach((node, index) => {
        const nodeId = node.id || `node_${index}`;
        node.id = nodeId;
        nodeMap.set(nodeId, node);
        graph.set(nodeId, new Set());
    });

    // Build graph edges
    links.forEach(link => {
        const source = typeof link.source === 'object' ? link.source : nodeMap.get(link.source);
        const target = typeof link.target === 'object' ? link.target : nodeMap.get(link.target);

        if (source && target) {
            const sourceId = source.id;
            const targetId = target.id;

            if (graph.has(sourceId) && graph.has(targetId)) {
                graph.get(sourceId).add({ target: targetId, link });
                graph.get(targetId).add({ target: sourceId, link });
            }
        }
    });

    // Find paths with depth limit
    function findPathsWithLimit(current, end, maxDepth, visited, currentPath, currentLinks, depth = 0) {
        // Stop if we've exceeded max depth
        if (depth > maxDepth) return false;

        // Found a path
        if (current === end) {
            paths.push({
                nodes: [...currentPath],
                links: [...currentLinks]
            });
            return true;
        }

        const neighbors = graph.get(current);
        if (!neighbors) return false;

        let foundPath = false;
        for (const { target, link } of neighbors) {
            if (!visited.has(target)) {
                const nextNode = nodeMap.get(target);
                if (nextNode) {
                    visited.add(target);
                    currentPath.push(nextNode);
                    currentLinks.push(link);
                    foundPath = findPathsWithLimit(target, end, maxDepth, visited, currentPath, currentLinks, depth + 1) || foundPath;
                    currentLinks.pop();
                    currentPath.pop();
                    visited.delete(target);
                }
            }
        }
        return foundPath;
    }

    // Find the team nodes
    const team1Node = nodes.find(n => n.name === team1);
    const team2Node = nodes.find(n => n.name === team2);

    if (!team1Node || !team2Node) {
        return { nodes: [], links: [], paths: [] };
    }

    // Start with initial max distance
    let currentMaxDepth = initialMaxDistance;
    let foundPaths = false;

    // Try finding paths with current depth
    const visited = new Set([team1Node.id]);
    foundPaths = findPathsWithLimit(team1Node.id, team2Node.id, currentMaxDepth, visited, [team1Node], []);

    // If no paths found and depth is less than 6, increment and try again
    while (!foundPaths && currentMaxDepth < 6) {
        currentMaxDepth++;
        paths.length = 0; // Clear previous attempts
        visited.clear();
        visited.add(team1Node.id);
        foundPaths = findPathsWithLimit(team1Node.id, team2Node.id, currentMaxDepth, visited, [team1Node], []);
    }

    // Process found paths
    paths.forEach(path => {
        path.nodes.forEach(node => resultNodes.add(node));
        path.links.forEach(link => resultLinks.add(link));
    });

    // Sort paths by length
    paths.sort((a, b) => a.nodes.length - b.nodes.length);

    // Update details panel
    updateTeamConnectionDetails(team1, team2, paths);

    return {
        nodes: Array.from(resultNodes),
        links: Array.from(resultLinks),
        paths
    };
}

function updateTeamConnectionDetails(team1, team2, paths) {
    const detailsPanel = document.getElementById('detailsPanel');
    if (!detailsPanel) return;

    let html = `<h3>Connections between ${team1} and ${team2}</h3>`;

    // Group paths by number of steps
    const pathsBySteps = {};
    paths.forEach(path => {
        const steps = path.nodes.length - 1;
        if (!pathsBySteps[steps]) {
            pathsBySteps[steps] = [];
        }
        pathsBySteps[steps].push(path);
    });

    // Display paths grouped by number of steps
    Object.entries(pathsBySteps).forEach(([steps, stepPaths]) => {
        html += `<h4>${steps}-step Connections (${stepPaths.length} paths)</h4>`;
        stepPaths.forEach((path, index) => {
            html += `<div class="path-details">`;
            html += `<p>Path ${index + 1}:</p>`;
            path.nodes.forEach((node, i) => {
                if (i > 0) html += ' → ';
                const color = node.type === 'team' ? getTeamColor(node.name) : getPositionColor(node.position);
                html += `<span style="color: ${color}">${node.name}</span>`;
                if (node.type !== 'team' && node.years) {
                    html += ` (${node.years})`;
                }
            });
            html += '</div>';
        });
    });

    detailsPanel.innerHTML = html;
}

// Helper function to get team colors
function getTeamColor(teamName) {
    const teamColors = {
        'Arizona Cardinals': '#97233F',
        'Atlanta Falcons': '#A71930',
        'Baltimore Ravens': '#241773',
        'Buffalo Bills': '#00338D',
        'Carolina Panthers': '#0085CA',
        'Chicago Bears': '#C83803',
        'Cincinnati Bengals': '#FB4F14',
        'Cleveland Browns': '#FF3C00',
        'Dallas Cowboys': '#003594',
        'Denver Broncos': '#FB4F14',
        'Detroit Lions': '#0076B6',
        'Green Bay Packers': '#203731',
        'Houston Texans': '#03202F',
        'Indianapolis Colts': '#002C5F',
        'Jacksonville Jaguars': '#006778',
        'Kansas City Chiefs': '#E31837',
        'Las Vegas Raiders': '#000000',
        'Los Angeles Chargers': '#0080C6',
        'Los Angeles Rams': '#003594',
        'Miami Dolphins': '#008E97',
        'Minnesota Vikings': '#4F2683',
        'New England Patriots': '#002244',
        'New Orleans Saints': '#D3BC8D',
        'New York Giants': '#0B2265',
        'New York Jets': '#125740',
        'Philadelphia Eagles': '#004C54',
        'Pittsburgh Steelers': '#FFB612',
        'San Francisco 49ers': '#AA0000',
        'Seattle Seahawks': '#002244',
        'Tampa Bay Buccaneers': '#D50A0A',
        'Tennessee Titans': '#0C2340',
        'Washington Commanders': '#773141'
    };
    return teamColors[teamName] || '#666666';
}

// Helper function to get position colors
function getPositionColor(position) {
    if (!position) return '#666666';
    if (position.includes('Head Coach')) return '#E91E63';
    if (position.includes('Offensive')) return '#FF9800';
    if (position.includes('Defensive')) return '#9C27B0';
    if (position.includes('Special Teams')) return '#795548';
    return '#666666';
}

// Update team comparison details to show all paths
function updateTeamComparisonDetails(team1, team2, data) {
    const detailsPanel = document.getElementById('detailsPanel');
    const team1Colors = getTeamColors(team1);
    const team2Colors = getTeamColors(team2);

    let html = `
        <h2 style="margin-bottom: 15px;">All Connections Between:</h2>
        <div style="display: flex; gap: 10px; margin-bottom: 15px;">
            <div style="font-weight: bold; color: ${team1Colors.primary};">${team1}</div>
            <div>and</div>
            <div style="font-weight: bold; color: ${team2Colors.primary};">${team2}</div>
        </div>
    `;

    // Group paths by length
    const pathsByLength = new Map();
    data.paths.forEach(path => {
        const length = path.length - 1; // Number of steps between teams
        if (!pathsByLength.has(length)) {
            pathsByLength.set(length, []);
        }
        pathsByLength.get(length).push(path);
    });

    // Display paths grouped by length
    Array.from(pathsByLength.keys()).sort((a, b) => a - b).forEach(length => {
        const paths = pathsByLength.get(length);
        html += `
            <div style="margin-bottom: 20px;">
                <h3 style="color: #666; margin-bottom: 10px;">${length} Step Connection${length !== 1 ? 's' : ''} (${paths.length} path${paths.length !== 1 ? 's' : ''})</h3>
        `;

        paths.forEach(path => {
            html += `<div style="margin-bottom: 15px; padding: 10px; background: #f8f9fa; border-radius: 4px;">`;

            // Convert node IDs to names and add connection details
            for (let i = 0; i < path.length; i++) {
                const node = data.nodes.find(n => n.id === path[i]);
                const nextNode = i < path.length - 1 ? data.nodes.find(n => n.id === path[i + 1]) : null;

                if (node.type === 'team') {
                    const teamColors = getTeamColors(node.name);
                    html += `<span style="color: ${teamColors.primary}; font-weight: bold;">${node.name}</span>`;
                } else {
                    // Find the connection details between this coach and adjacent teams
                    const prevLink = data.links.find(l =>
                        (l.source === path[i - 1] && l.target === path[i]) ||
                        (l.source === path[i] && l.target === path[i - 1])
                    );
                    const nextLink = nextNode ? data.links.find(l =>
                        (l.source === path[i] && l.target === path[i + 1]) ||
                        (l.source === path[i + 1] && l.target === path[i])
                    ) : null;

                    html += `
                        <span style="margin: 0 5px;">→</span>
                        <span style="color: #333;">${node.name}</span>
                        <span style="color: #666; font-size: 0.9em;">
                            (${prevLink ? prevLink.type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) : ''} 
                            ${prevLink ? prevLink.years : ''})
                        </span>
                    `;
                }

                if (i < path.length - 1 && nextNode.type === 'team') {
                    html += `<span style="margin: 0 5px;">→</span>`;
                }
            }
            html += `</div>`;
        });
        html += `</div>`;
    });

    detailsPanel.innerHTML = html;
}

// Update filterTeamToTeam to use new connection finding
function filterTeamToTeam(team1, team2) {
    return findAllConnections(team1, team2);
}

// Update initializeFilters function
function initializeFilters() {
    const coachSelect = document.getElementById('coachSelect');
    const teamSelect = document.getElementById('teamSelect');
    const secondTeamSelect = document.getElementById('secondTeamSelect');
    const { nodes } = processCoachingData();

    // Initialize coach dropdown
    const coaches = nodes.filter(n => n.type === 'coach');
    coachSelect.innerHTML = '<option value="">Select a Coach</option>';
    coaches.sort((a, b) => a.name.localeCompare(b.name)).forEach(coach => {
        const option = document.createElement('option');
        option.value = coach.name;
        option.textContent = `${coach.name} (${coach.position})`;
        coachSelect.appendChild(option);
    });

    // Initialize team dropdowns
    const teams = nodes.filter(n => n.type === 'team');
    const teamOptions = teams.sort((a, b) => a.name.localeCompare(b.name)).map(team => {
        return `<option value="${team.name}">${team.name}</option>`;
    }).join('');

    teamSelect.innerHTML = '<option value="">Select a Team</option>' + teamOptions;
    secondTeamSelect.innerHTML = '<option value="">Compare with Team (Optional)</option>' + teamOptions;

    // Add event listeners
    coachSelect.addEventListener('change', (e) => {
        const selectedCoach = e.target.value;
        if (selectedCoach) {
            teamSelect.value = '';
            secondTeamSelect.value = '';
            updateVisualization(selectedCoach, null);
            updateCoachDetails(selectedCoach);
        }
    });

    teamSelect.addEventListener('change', (e) => {
        const selectedTeam = e.target.value;
        const secondTeam = secondTeamSelect.value;
        if (selectedTeam) {
            coachSelect.value = '';
            if (secondTeam) {
                const filteredData = filterTeamToTeam(selectedTeam, secondTeam);
                drawNetwork(filteredData);
                updateTeamComparisonDetails(selectedTeam, secondTeam, filteredData);
            } else {
                updateVisualization(null, selectedTeam);
                updateTeamDetails(selectedTeam);
            }
        }
    });

    secondTeamSelect.addEventListener('change', (e) => {
        const selectedTeam = teamSelect.value;
        const secondTeam = e.target.value;
        if (selectedTeam && secondTeam) {
            coachSelect.value = '';
            const filteredData = filterTeamToTeam(selectedTeam, secondTeam);
            drawNetwork(filteredData);
            updateTeamComparisonDetails(selectedTeam, secondTeam, filteredData);
        } else if (selectedTeam) {
            updateVisualization(null, selectedTeam);
            updateTeamDetails(selectedTeam);
        }
    });

    // Add distance slider event listener
    const distanceSlider = document.getElementById('distanceSlider');
    const distanceValue = document.getElementById('distanceValue');

    if (distanceSlider && distanceValue) {
        distanceValue.textContent = distanceSlider.value;

        distanceSlider.addEventListener('input', (e) => {
            distanceValue.textContent = e.target.value;
            const selectedCoach = coachSelect.value;
            const selectedTeam = teamSelect.value;
            const secondTeam = secondTeamSelect.value;

            if (selectedTeam && secondTeam) {
                // Don't apply distance filter for team comparison
                return;
            }

            if (selectedCoach || selectedTeam) {
                updateVisualization(selectedCoach, selectedTeam);
            }
        });
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    initializeFilters();
    drawNetwork();
});

// Utility functions
function getNodeRadius(d) {
    return d.type === 'team' ? 25 : 15;
}

function getTeamColors(teamName) {
    const teamColors = {
        'Arizona Cardinals': { primary: '#97233F', secondary: '#000000' },
        'Atlanta Falcons': { primary: '#A71930', secondary: '#000000' },
        'Baltimore Ravens': { primary: '#241773', secondary: '#9E7C0C' },
        'Buffalo Bills': { primary: '#00338D', secondary: '#C60C30' },
        'Carolina Panthers': { primary: '#0085CA', secondary: '#101820' },
        'Chicago Bears': { primary: '#0B162A', secondary: '#C83803' },
        'Cincinnati Bengals': { primary: '#FB4F14', secondary: '#000000' },
        'Cleveland Browns': { primary: '#FF3C00', secondary: '#311D00' },
        'Dallas Cowboys': { primary: '#003594', secondary: '#869397' },
        'Denver Broncos': { primary: '#FB4F14', secondary: '#002244' },
        'Detroit Lions': { primary: '#0076B6', secondary: '#B0B7BC' },
        'Green Bay Packers': { primary: '#203731', secondary: '#FFB612' },
        'Houston Texans': { primary: '#03202F', secondary: '#A71930' },
        'Indianapolis Colts': { primary: '#002C5F', secondary: '#A2AAAD' },
        'Jacksonville Jaguars': { primary: '#006778', secondary: '#9F792C' },
        'Kansas City Chiefs': { primary: '#E31837', secondary: '#FFB81C' },
        'Las Vegas Raiders': { primary: '#000000', secondary: '#A5ACAF' },
        'Los Angeles Chargers': { primary: '#0080C6', secondary: '#FFC20E' },
        'Los Angeles Rams': { primary: '#003594', secondary: '#FFA300' },
        'Miami Dolphins': { primary: '#008E97', secondary: '#FC4C02' },
        'Minnesota Vikings': { primary: '#4F2683', secondary: '#FFC62F' },
        'New England Patriots': { primary: '#002244', secondary: '#C60C30' },
        'New Orleans Saints': { primary: '#D3BC8D', secondary: '#101820' },
        'New York Giants': { primary: '#0B2265', secondary: '#A71930' },
        'New York Jets': { primary: '#125740', secondary: '#000000' },
        'Philadelphia Eagles': { primary: '#004C54', secondary: '#A5ACAF' },
        'Pittsburgh Steelers': { primary: '#FFB612', secondary: '#101820' },
        'San Francisco 49ers': { primary: '#AA0000', secondary: '#B3995D' },
        'Seattle Seahawks': { primary: '#002244', secondary: '#69BE28' },
        'Tampa Bay Buccaneers': { primary: '#D50A0A', secondary: '#FF7900' },
        'Tennessee Titans': { primary: '#0C2340', secondary: '#4B92DB' },
        'Washington Commanders': { primary: '#5A1414', secondary: '#FFB612' }
    };

    return teamColors[teamName] || { primary: '#4CAF50', secondary: '#2E7D32' };
}

function getNodeColor(d) {
    if (d.type === 'coach') return '#2196F3';
    const colors = getTeamColors(d.name);
    return colors.primary;
}

function getLinkColor(d) {
    const colors = {
        'head_coach': '#E91E63',
        'offensive': '#FF9800',
        'defensive': '#9C27B0',
        'special_teams': '#795548'
    };
    return colors[d.type] || '#999';
}

function getLinkWidth(d) {
    return d.type === 'head_coach' ? 3 : 2;
}

// Drag behavior
function drag(simulation) {
    function dragstarted(event) {
        if (!event.active) simulation.alphaTarget(0.3).restart();
        event.subject.fx = event.subject.x;
        event.subject.fy = event.subject.y;
    }

    function dragged(event) {
        event.subject.fx = event.x;
        event.subject.fy = event.y;
    }

    function dragended(event) {
        if (!event.active) simulation.alphaTarget(0);
        event.subject.fx = null;
        event.subject.fy = null;
    }

    return d3.drag()
        .on("start", dragstarted)
        .on("drag", dragged)
        .on("end", dragended);
}

function updateCoachDetails(coachName) {
    const detailsPanel = document.getElementById('detailsPanel');
    const { nodes, links } = processCoachingData();
    const coach = nodes.find(n => n.name === coachName);

    if (!coach) {
        detailsPanel.innerHTML = '<p>Coach not found</p>';
        return;
    }

    // Get all connections for this coach
    const coachConnections = links.filter(link => {
        const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
        const targetId = typeof link.target === 'object' ? link.target.id : link.target;
        return sourceId === coach.id || targetId === coach.id;
    });

    let html = `
        <h2 style="color: #2196F3; margin-bottom: 15px;">${coach.name}</h2>
        <h3 style="color: #666; margin-bottom: 10px;">Coaching History</h3>
    `;

    // Group connections by team
    const teamHistory = new Map();
    coachConnections.forEach(conn => {
        const teamNode = nodes.find(n => n.id === (conn.source === coach.id ? conn.target : conn.source));
        if (!teamHistory.has(teamNode.name)) {
            teamHistory.set(teamNode.name, []);
        }
        teamHistory.get(teamNode.name).push({
            position: conn.type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
            years: conn.years
        });
    });

    // Display history by team
    teamHistory.forEach((positions, teamName) => {
        const teamColors = getTeamColors(teamName);
        html += `
            <div style="margin-bottom: 15px; padding: 10px; background: #f8f9fa; border-radius: 4px; border-left: 4px solid ${teamColors.primary};">
                <div style="font-weight: bold; color: ${teamColors.primary};">${teamName}</div>
        `;
        positions.forEach(pos => {
            html += `
                <div style="margin-top: 5px;">
                    <span style="color: #666;">${pos.position}</span>
                    <span style="color: #888; font-size: 0.9em;"> (${pos.years})</span>
                </div>
            `;
        });
        html += '</div>';
    });

    detailsPanel.innerHTML = html;
}

function updateTeamDetails(teamName) {
    const detailsPanel = document.getElementById('detailsPanel');
    const { nodes, links } = processCoachingData();
    const team = nodes.find(n => n.name === teamName);

    if (!team) {
        detailsPanel.innerHTML = '<p>Team not found</p>';
        return;
    }

    const teamColors = getTeamColors(teamName);

    // Get all connections for this team
    const teamConnections = links.filter(link => {
        const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
        const targetId = typeof link.target === 'object' ? link.target.id : link.target;
        return sourceId === team.id || targetId === team.id;
    });

    let html = `
        <h2 style="color: ${teamColors.primary}; margin-bottom: 15px;">${team.name}</h2>
        <h3 style="color: #666; margin-bottom: 10px;">Coaching Staff History</h3>
    `;

    // Group coaches by position
    const positionGroups = {
        'head_coach': { title: 'Head Coaches', coaches: [] },
        'offensive': { title: 'Offensive Coordinators', coaches: [] },
        'defensive': { title: 'Defensive Coordinators', coaches: [] },
        'special_teams': { title: 'Special Teams Coordinators', coaches: [] }
    };

    teamConnections.forEach(conn => {
        const coach = nodes.find(n => n.id === (conn.source === team.id ? conn.target : conn.source));
        positionGroups[conn.type].coaches.push({
            name: coach.name,
            years: conn.years
        });
    });

    // Display coaches by position
    Object.entries(positionGroups).forEach(([type, group]) => {
        if (group.coaches.length > 0) {
            const color = getLinkColor({ type });
            html += `
                <div style="margin-bottom: 20px;">
                    <h4 style="color: ${color}; margin-bottom: 10px;">${group.title}</h4>
            `;
            group.coaches.forEach(coach => {
                html += `
                    <div style="margin-bottom: 8px; padding: 8px; background: #f8f9fa; border-radius: 4px;">
                        <span style="font-weight: bold;">${coach.name}</span>
                        <span style="color: #888; font-size: 0.9em;"> (${coach.years})</span>
                    </div>
                `;
            });
            html += '</div>';
        }
    });

    detailsPanel.innerHTML = html;
} 