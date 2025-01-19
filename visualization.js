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

// Initialize visualization and return references
function initializeVisualization() {
    // Clear any existing visualization
    d3.select('#coachNetwork').selectAll('*').remove();

    // Get the container dimensions
    const container = document.getElementById('coachNetwork');
    const width = container.clientWidth;
    const height = 600;

    // Create SVG element
    const svg = d3.select('#coachNetwork')
        .append('svg')
        .attr('width', width)
        .attr('height', height)
        .attr('viewBox', [0, 0, width, height]);

    // Create a group for zoom/pan
    const g = svg.append('g');

    // Add zoom behavior
    const zoom = d3.zoom()
        .scaleExtent([0.5, 2])
        .on('zoom', (event) => {
            g.attr('transform', event.transform);
        });

    svg.call(zoom);

    return { svg, g, width, height };
}

// Drag behavior for nodes
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
        .on('start', dragstarted)
        .on('drag', dragged)
        .on('end', dragended);
}

// Draw the network visualization
function drawNetwork(data, selectedTeams = []) {
    const { svg, g, width, height } = initializeVisualization();

    // Process data if not provided
    if (!data) {
        data = processCoachingData();
    }

    // Create force simulation
    const simulation = d3.forceSimulation(data.nodes)
        .force('link', d3.forceLink(data.links).id(d => d.id))
        .force('charge', d3.forceManyBody().strength(d => d.type === 'team' ? -500 : -200))
        .force('center', d3.forceCenter(width / 2, height / 2))
        .force('collision', d3.forceCollide().radius(d => {
            if (d.type === 'team' && selectedTeams.includes(d.name)) {
                return 46; // Base(15) * 2 + 16(1rem)
            }
            return d.type === 'team' ? 15 : 10;
        }));

    // Draw links
    const links = g.selectAll('.link')
        .data(data.links)
        .join('line')
        .attr('class', 'link')
        .each(function (d) {
            const styles = getLinkStyle(d);
            d3.select(this)
                .style('stroke', styles.stroke)
                .style('stroke-width', styles['stroke-width'])
                .style('stroke-dasharray', styles['stroke-dasharray']);
        });

    // Create a group for each node to hold both circles
    const nodeGroups = g.selectAll('.node-group')
        .data(data.nodes)
        .join('g')
        .attr('class', 'node-group')
        .call(drag(simulation));

    // Add outer ring for selected teams
    nodeGroups.each(function (d) {
        const group = d3.select(this);
        if (d.type === 'team' && selectedTeams.includes(d.name)) {
            const colors = getTeamColors(d.name);
            group.append('circle')
                .attr('class', 'outer-ring')
                .style('fill', 'none')
                .style('stroke', colors.secondary)
                .style('stroke-width', 2)
                .attr('r', 46); // Base(15) * 2 + 16(1rem)
        }
    });

    // Add main node circles
    nodeGroups.each(function (d) {
        const group = d3.select(this);
        const isSelected = selectedTeams.includes(d.name);
        const colors = d.type === 'team' ? getTeamColors(d.name) : null;

        group.append('circle')
            .attr('class', 'node')
            .style('fill', d.type === 'team' ? colors.primary : '#ffffff')
            .style('stroke', d.type === 'team' ? colors.secondary : '#666666')
            .style('stroke-width', 2)
            .attr('r', d.type === 'team' ?
                (isSelected ? 30 : 15) : // Teams: selected = 2x size
                10 // Coaches: regular size
            );
    });

    // Add labels
    const labels = g.selectAll('.label')
        .data(data.nodes)
        .join('text')
        .attr('class', 'label')
        .text(d => d.name)
        .style('font-size', '12px')
        .style('text-anchor', 'middle')
        .style('pointer-events', 'none');

    // Update positions on tick
    simulation.on('tick', () => {
        links
            .attr('x1', d => d.source.x)
            .attr('y1', d => d.source.y)
            .attr('x2', d => d.target.x)
            .attr('y2', d => d.target.y);

        nodeGroups
            .attr('transform', d => `translate(${d.x}, ${d.y})`);

        labels
            .attr('x', d => d.x)
            .attr('y', d => d.y + 20);
    });

    // Handle window resize
    const container = document.getElementById('coachNetwork');
    window.addEventListener('resize', () => {
        const newWidth = container.clientWidth;
        svg.attr('width', newWidth);
        simulation.force('center', d3.forceCenter(newWidth / 2, height / 2));
        simulation.alpha(0.3).restart();
    });

    // Update the legend
    updateLegend();

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
function findAllConnections(team1, team2) {
    const { nodes, links } = processCoachingData();
    const nodeMap = new Map(nodes.map(node => [node.id, node]));
    const graph = new Map();

    // Build graph
    nodes.forEach(node => graph.set(node.id, new Set()));
    links.forEach(link => {
        graph.get(link.source).add(link.target);
        graph.get(link.target).add(link.source);
    });

    const team1Node = nodes.find(n => n.type === 'team' && n.name === team1);
    const team2Node = nodes.find(n => n.type === 'team' && n.name === team2);

    if (!team1Node || !team2Node) {
        return { nodes: [], links: [], paths: [] };
    }

    const paths = [];
    const visited = new Set();
    const currentPath = [team1Node.id];
    const currentLinks = [];

    function dfs(current, target) {
        if (current === target) {
            // Convert path of IDs to full nodes and links
            const pathNodes = currentPath.map(id => nodeMap.get(id));
            const pathLinks = currentLinks.map(link => ({
                source: nodeMap.get(link.source),
                target: nodeMap.get(link.target),
                type: link.type,
                years: link.years
            }));
            paths.push({ nodes: pathNodes, links: pathLinks });
            return;
        }

        visited.add(current);
        const neighbors = graph.get(current);

        if (neighbors) {
            for (const neighbor of neighbors) {
                if (!visited.has(neighbor)) {
                    // Find the link between current and neighbor
                    const link = links.find(l =>
                        (l.source === current && l.target === neighbor) ||
                        (l.source === neighbor && l.target === current)
                    );

                    currentPath.push(neighbor);
                    currentLinks.push(link);
                    dfs(neighbor, target);
                    currentPath.pop();
                    currentLinks.pop();
                }
            }
        }
        visited.delete(current);
    }

    dfs(team1Node.id, team2Node.id);

    // Get unique nodes and links from all paths
    const uniqueNodes = new Set();
    const uniqueLinks = new Set();
    paths.forEach(path => {
        path.nodes.forEach(node => uniqueNodes.add(node));
        path.links.forEach(link => uniqueLinks.add(link));
    });

    return {
        nodes: Array.from(uniqueNodes),
        links: Array.from(uniqueLinks),
        paths: paths
    };
}

function updateTeamConnectionDetails(team1, team2, data) {
    if (!data || !data.paths) return;

    const detailsPanel = document.getElementById('detailsPanel');
    if (!detailsPanel) return;

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

    // Group paths by length (number of steps between teams)
    const pathsByLength = new Map();
    data.paths.forEach(path => {
        // Calculate steps (number of coaches between teams)
        const steps = Math.floor((path.nodes.length - 2) / 2); // Subtract the two teams and divide by 2 for coaches
        if (!pathsByLength.has(steps)) {
            pathsByLength.set(steps, []);
        }
        pathsByLength.get(steps).push(path);
    });

    // Display paths grouped by length
    Array.from(pathsByLength.keys()).sort((a, b) => a - b).forEach(steps => {
        const paths = pathsByLength.get(steps);
        html += `
            <div style="margin-bottom: 20px;">
                <h3 style="color: #666; margin-bottom: 10px;">${steps} Step Connection${steps !== 1 ? 's' : ''} (${paths.length} path${paths.length !== 1 ? 's' : ''})</h3>
        `;

        paths.forEach((path, index) => {
            html += `<div style="margin-bottom: 15px; padding: 10px; background: #f8f9fa; border-radius: 4px;">`;

            path.nodes.forEach((node, i) => {
                if (i > 0) html += ' → ';

                if (node.type === 'team') {
                    const teamColors = getTeamColors(node.name);
                    html += `<span style="color: ${teamColors.primary}; font-weight: bold;">${node.name}</span>`;
                } else {
                    html += `<span style="color: #333;">${node.name}</span>`;
                    // Find the connection details from the path's links
                    const prevNode = i > 0 ? path.nodes[i - 1] : null;
                    const nextNode = i < path.nodes.length - 1 ? path.nodes[i + 1] : null;
                    const link = path.links.find(l =>
                        (l.source === prevNode && l.target === node) ||
                        (l.source === node && l.target === prevNode)
                    );
                    if (link) {
                        html += `<span style="color: #666; font-size: 0.9em;"> (${link.type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())} ${link.years})</span>`;
                    }
                }
            });
            html += '</div>';
        });
        html += '</div>';
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
    // Process the initial data
    const data = processCoachingData();

    // Draw the initial network
    drawNetwork(data);

    // Initialize filters
    initializeFilters();
});

// Utility functions
function getNodeRadius(d, isSelected = false) {
    if (d.type === 'team') {
        return isSelected ? 20 : 15;
    }
    return 10;  // For coach nodes
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

// Get the style for a link based on its type
function getLinkStyle(link) {
    const type = link.type || '';
    const years = link.years || '';
    const isCurrent = years.includes('present');

    const colors = {
        'head_coach': '#E91E63',
        'offensive': '#FF9800',
        'defensive': '#9C27B0',
        'special_teams': '#795548'
    };

    const color = colors[type] || '#666666';
    const strokeWidth = type === 'head_coach' ? 4 : 2;

    return {
        stroke: color,
        'stroke-width': strokeWidth,
        'stroke-dasharray': isCurrent ? null : '4'
    };
}

// Get the style for a node based on its type and selection status
function getNodeStyle(node, selectedTeams) {
    const isSelected = selectedTeams && selectedTeams.includes(node.name);
    const baseRadius = node.type === 'team' ? 15 : 10;

    if (node.type === 'team') {
        const colors = getTeamColors(node.name);
        return {
            fill: colors.primary,
            stroke: colors.secondary,
            'stroke-width': 2,
            r: isSelected ? baseRadius * 2 : baseRadius,
            isSelected: isSelected  // Flag for adding outer ring
        };
    } else {
        return {
            fill: '#ffffff',
            stroke: '#666666',
            'stroke-width': 1,
            r: baseRadius
        };
    }
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

// Update the legend with connection types and styles
function updateLegend() {
    const legend = document.getElementById('relationshipLegend');
    if (!legend) return;

    const html = `
        <div class="legend-title">Connection Types</div>
        <div class="legend-section">
            <div class="legend-item">
                <svg width="30" height="20">
                    <line x1="5" y1="10" x2="25" y2="10" stroke="#E91E63" stroke-width="4"/>
                </svg>
                <span>Head Coach (Current)</span>
            </div>
            <div class="legend-item">
                <svg width="30" height="20">
                    <line x1="5" y1="10" x2="25" y2="10" stroke="#E91E63" stroke-width="4" stroke-dasharray="4"/>
                </svg>
                <span>Head Coach (Historical)</span>
            </div>
        </div>
        <div class="legend-section">
            <div class="legend-item">
                <svg width="30" height="20">
                    <line x1="5" y1="10" x2="25" y2="10" stroke="#FF9800" stroke-width="2"/>
                </svg>
                <span>Offensive Coordinator (Current)</span>
            </div>
            <div class="legend-item">
                <svg width="30" height="20">
                    <line x1="5" y1="10" x2="25" y2="10" stroke="#FF9800" stroke-width="2" stroke-dasharray="4"/>
                </svg>
                <span>Offensive Coordinator (Historical)</span>
            </div>
        </div>
        <div class="legend-section">
            <div class="legend-item">
                <svg width="30" height="20">
                    <line x1="5" y1="10" x2="25" y2="10" stroke="#9C27B0" stroke-width="2"/>
                </svg>
                <span>Defensive Coordinator (Current)</span>
            </div>
            <div class="legend-item">
                <svg width="30" height="20">
                    <line x1="5" y1="10" x2="25" y2="10" stroke="#9C27B0" stroke-width="2" stroke-dasharray="4"/>
                </svg>
                <span>Defensive Coordinator (Historical)</span>
            </div>
        </div>
        <div class="legend-section">
            <div class="legend-item">
                <svg width="30" height="20">
                    <line x1="5" y1="10" x2="25" y2="10" stroke="#795548" stroke-width="2"/>
                </svg>
                <span>Special Teams Coordinator (Current)</span>
            </div>
            <div class="legend-item">
                <svg width="30" height="20">
                    <line x1="5" y1="10" x2="25" y2="10" stroke="#795548" stroke-width="2" stroke-dasharray="4"/>
                </svg>
                <span>Special Teams Coordinator (Historical)</span>
            </div>
        </div>
        <div class="legend-section">
            <div class="legend-item">
                <svg width="40" height="30">
                    <circle cx="20" cy="15" r="10" fill="#ffffff" stroke="#000000" stroke-width="2"/>
                </svg>
                <span>Team (Unselected)</span>
            </div>
            <div class="legend-item">
                <svg width="40" height="30">
                    <circle cx="20" cy="15" r="12" fill="#000000" stroke="#000000" stroke-width="4"/>
                </svg>
                <span>Team (Selected)</span>
            </div>
        </div>
    `;
    legend.innerHTML = html;
}

// Helper function to format years consistently
function formatYears(years) {
    if (!years) return '';
    const terms = years.split(',').map(term => term.trim());
    return terms.join(', ');
}

// Helper function to generate path description
function getPathDescription(path, nodes, links) {
    let description = '';
    path.nodes.forEach((node, i) => {
        if (i > 0) description += ' → ';
        const nodeData = nodes.find(n => n.id === node.id);
        if (nodeData.type === 'team') {
            const teamColors = getTeamColors(nodeData.name);
            description += `<span style="color: ${teamColors.primary}; font-weight: bold;">${nodeData.name}</span>`;
        } else {
            const prevNode = i > 0 ? path.nodes[i - 1] : null;
            const nextNode = i < path.nodes.length - 1 ? path.nodes[i + 1] : null;
            const link = links.find(l =>
                (l.source === prevNode?.id && l.target === node.id) ||
                (l.source === node.id && l.target === prevNode?.id)
            );
            description += `<span style="color: #333;">${nodeData.name}</span>`;
            if (link) {
                description += `<span style="color: #666; font-size: 0.9em;"> (${link.type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())} ${formatYears(link.years)})</span>`;
            }
        }
    });
    return description;
} 
