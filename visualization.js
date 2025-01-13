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

    // Process all teams and their coaching staffs
    Object.entries(team_coach_history).forEach(([teamName, teamData]) => {
        // Add team node
        const teamNode = addNode(teamName, 'team');

        // Process head coaches
        teamData.head_coaches.forEach(coach => {
            const coachNode = addNode(coach.name, 'coach', teamName, 'Head Coach');
            // Split terms and create separate links
            splitTerms(coach.years).forEach(term => {
                links.push({
                    source: coachNode.id,
                    target: teamNode.id,
                    type: 'head_coach',
                    years: term
                });
            });
        });

        // Process coordinators
        teamData.coordinators.forEach(coord => {
            const coordNode = addNode(coord.name, 'coach', teamName, coord.position);
            // Split terms and create separate links
            splitTerms(coord.years).forEach(term => {
                links.push({
                    source: coordNode.id,
                    target: teamNode.id,
                    type: coord.position.toLowerCase().includes('offensive') ? 'offensive' :
                        coord.position.toLowerCase().includes('defensive') ? 'defensive' : 'special_teams',
                    years: term
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
        .attr("stroke-opacity", 0.6)
        .attr("fill", "none")
        .attr("marker-end", "url(#arrowhead)")
        .on("mouseover", (event, d) => {
            // Show years on hover
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
                .attr("stroke-opacity", 0.6)
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
            );
            const linkIndex = sameNodes.indexOf(d);
            const total = sameNodes.length;

            // Calculate curve offset based on number of links
            const offset = total === 1 ? 0 : (linkIndex - (total - 1) / 2) * 20;

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

// Initialize filters and visualization
function initializeFilters() {
    // Initialize coach dropdown
    const coachSelect = document.getElementById('coachSelect');
    const { nodes } = processCoachingData();
    const coaches = nodes.filter(n => n.type === 'coach');

    coachSelect.innerHTML = '<option value="">Select a Coach</option>';
    coaches.sort((a, b) => a.name.localeCompare(b.name)).forEach(coach => {
        const option = document.createElement('option');
        option.value = coach.name;
        option.textContent = `${coach.name} (${coach.position})`;
        coachSelect.appendChild(option);
    });

    // Initialize team dropdown
    const teamSelect = document.getElementById('teamSelect');
    const teams = nodes.filter(n => n.type === 'team');

    teamSelect.innerHTML = '<option value="">Select a Team</option>';
    teams.sort((a, b) => a.name.localeCompare(b.name)).forEach(team => {
        const option = document.createElement('option');
        option.value = team.name;
        option.textContent = team.name;
        teamSelect.appendChild(option);
    });

    // Add event listeners
    coachSelect.addEventListener('change', (e) => {
        const selectedCoach = e.target.value;
        if (selectedCoach) {
            teamSelect.value = ''; // Clear team selection
            updateVisualization(selectedCoach, null);
            updateCoachDetails(selectedCoach);
        }
    });

    teamSelect.addEventListener('change', (e) => {
        const selectedTeam = e.target.value;
        if (selectedTeam) {
            coachSelect.value = ''; // Clear coach selection
            updateVisualization(null, selectedTeam);
            updateTeamDetails(selectedTeam);
        }
    });

    // Add distance slider event listener
    const distanceSlider = document.getElementById('distanceSlider');
    const distanceValue = document.getElementById('distanceValue');

    if (distanceSlider && distanceValue) {
        // Set initial value
        distanceValue.textContent = distanceSlider.value;

        distanceSlider.addEventListener('input', (e) => {
            // Update the displayed value
            distanceValue.textContent = e.target.value;

            // Update visualization if something is selected
            const selectedCoach = coachSelect.value;
            const selectedTeam = teamSelect.value;
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