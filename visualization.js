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
        const [start, end] = yearStr.split('-').map(y => {
            if (y.trim() == 'present') {
                return parseInt(new Date().getFullYear())
            };
            return parseInt(y.trim());
        });
        return { start, end: end || start };
    }

    // Helper function to check if a year range overlaps with selected years
    function isInYearRange(yearStr) {
        if (!selectedStartYear && !selectedEndYear) return true;

        const { start, end } = parseYearRange(yearStr);
        const filterStart = selectedStartYear || 1960;
        const filterEnd = selectedEndYear || new Date().getFullYear();

        return (start <= filterEnd && end >= filterStart);
    }

    // Process all teams and their coaching staffs
    Object.entries(team_coach_history).forEach(([teamName, teamData]) => {
        // Add team node
        const teamNode = addNode(teamName, 'team');

        // Process head coaches
        teamData.head_coaches.forEach(coach => {
            if (!isInYearRange(coach.years)) return;

            const coachNode = addNode(coach.name, 'coach', teamName, 'Head Coach');
            // Split terms and create separate links
            splitTerms(coach.years).forEach(term => {
                if (!isInYearRange(term)) return;

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
            if (!isInYearRange(coord.years)) return;

            const coordNode = addNode(coord.name, 'coach', teamName, coord.position);
            // Split terms and create separate links
            splitTerms(coord.years).forEach(term => {
                if (!isInYearRange(term)) return;

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
    const container = d3.select('#networkContainer');
    const width = container.node().getBoundingClientRect().width;
    const height = 600;

    // Create SVG
    const svg = container.append("svg")
        .attr("width", width)
        .attr("height", height)
        .attr("viewBox", [0, 0, width, height]);

    // Add glow filter definition
    const defs = svg.append("defs");
    const filter = defs.append("filter")
        .attr("id", "glow")
        .attr("x", "-100%")
        .attr("y", "-100%")
        .attr("width", "300%")
        .attr("height", "300%");

    filter.append("feGaussianBlur")
        .attr("stdDeviation", "12")
        .attr("result", "coloredBlur");

    filter.append("feFlood")
        .attr("flood-color", "#FFD700")
        .attr("flood-opacity", "1")
        .attr("result", "glowColor");

    filter.append("feComposite")
        .attr("in", "glowColor")
        .attr("in2", "coloredBlur")
        .attr("operator", "in")
        .attr("result", "softGlow");

    const feMerge = filter.append("feMerge");
    feMerge.append("feMergeNode")
        .attr("in", "softGlow");
    feMerge.append("feMergeNode")
        .attr("in", "SourceGraphic");

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
    const oldestYear = d3.min(links, d => d.yearEnd);
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
            .radius(d => getNodeRadius(d) + 20))
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
            console.log(d.yearEnd, oldestYear, currentYear, d.label)

            if (d.yearEnd >= currentYear) return 1.0;  // Present coaches

            const opacity = 0.2 + (0.8 * Math.pow((d.yearEnd - oldestYear) / (Math.max(currentYear - oldestYear + .001, .001)), 3));  // Exponential scaling to emphasize recent years
            console.log(d, opacity)
            return parseFloat(opacity.toFixed(2))
        })
        .attr("stroke-dasharray", d => {
            const currentYear = new Date().getFullYear();

            if (d.yearEnd == currentYear) {
                return "none";
            }
            const dashLength = (d.yearEnd - oldestYear + 1)
            const pattern = `${dashLength * 2},3`;  // 4px dash, 4px gap
            return pattern
        })
        .attr("fill", "none")
        .on("mouseover", (event, d) => {
            const position = d.type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
            const sourceName = typeof d.source === 'object' ? d.source.name : nodes.find(n => n.id === d.source).name;
            const targetName = typeof d.target === 'object' ? d.target.name : nodes.find(n => n.id === d.target).name;
            const currentYear = new Date().getFullYear();
            const status = d.yearEnd >= currentYear ? "Current" :
                d.yearEnd === currentYear - 1 ? "Last Year" :
                    `${currentYear - d.yearEnd} years ago`;

            const tooltipContent = `${sourceName} → ${targetName}
${position}
${d.years} (${status})`;

            const tooltip = g.append("g")
                .attr("class", "tooltip")
                .attr("pointer-events", "none");

            const tooltipBg = tooltip.append("rect")
                .attr("fill", "white")
                .attr("rx", 4)
                .attr("ry", 4)
                .attr("opacity", 0.9);

            const tooltipLabel = tooltip.append("text")
                .attr("fill", "#333")
                .attr("font-size", "12px")
                .attr("text-anchor", "middle");

            tooltipLabel.selectAll("tspan")
                .data(tooltipContent.split("\n"))
                .join("tspan")
                .attr("x", 0)
                .attr("dy", (d, i) => i === 0 ? 0 : "1.2em")
                .text(d => d);

            const bbox = tooltipLabel.node().getBBox();
            const padding = 6;

            tooltipBg
                .attr("x", bbox.x - padding)
                .attr("y", bbox.y - padding)
                .attr("width", bbox.width + (padding * 2))
                .attr("height", bbox.height + (padding * 2));

            tooltip.attr("transform", `translate(${(d.source.x + d.target.x) / 2},${(d.source.y + d.target.y) / 2 - bbox.height - 10})`);

            d3.select(event.currentTarget)
                .attr("stroke-opacity", 1)
                .attr("stroke-width", getLinkWidth(d) + 1);
        })
        .on("mouseout", (event, d) => {
            g.selectAll(".tooltip").remove();
            d3.select(event.currentTarget)
                .attr("stroke-opacity", d => {
                    const currentYear = new Date().getFullYear();
                    if (d.yearEnd >= currentYear) return 1.0;  // Present coaches
                    const yearsAgo = currentYear - d.yearEnd;
                    const maxYearsForOpacity = 10;  // After 10 years, opacity will be at minimum
                    return Math.max(0.4, 1.0 - (0.6 * yearsAgo / maxYearsForOpacity));  // Scale from 1.0 to 0.4
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
                const secondTeamSelect = document.getElementById('secondTeamSelect');
                teamSelect.value = '';
                secondTeamSelect.value = '';
                updateVisualization(d.name, null, null);
                updateCoachDetails(d.name);
            } else if (d.type === 'team') {
                const teamSelect = document.getElementById('teamSelect');
                const secondTeamSelect = document.getElementById('secondTeamSelect');
                const coachSelect = document.getElementById('coachSelect');
                coachSelect.value = '';

                if (event.shiftKey) {
                    // Shift-click: select as second team
                    if (teamSelect.value && teamSelect.value !== d.name) {
                        secondTeamSelect.value = d.name;
                        updateVisualization(null, teamSelect.value, d.name);
                        const filteredData = filterTeamToTeam(teamSelect.value, d.name);
                        updateTeamComparisonDetails(teamSelect.value, d.name, filteredData);
                    }
                } else {
                    // Regular click: select as primary team
                    teamSelect.value = d.name;
                    secondTeamSelect.value = '';
                    updateVisualization(null, d.name, null);
                    updateTeamDetails(d.name);
                }
            }
        });

    // Add circles to nodes
    node.append("circle")
        .attr("r", getNodeRadius)
        .attr("fill", d => {
            if (d.type === 'coach') {
                return d.name === selectedCoach ? '#FFD700' : getNodeColor(d);  // Yellow fill for selected coach
            }
            const colors = getTeamColors(d.name);
            return colors.primary;
        })
        .attr("stroke", d => {
            if (d.type === 'coach') {
                return d.name === selectedCoach ? '#2196F3' : '#fff';  // Blue outline for selected coach
            }
            const colors = getTeamColors(d.name);
            return colors.secondary;
        })
        .attr("stroke-width", d => {
            if (d.type === 'team') return 4;
            return d.name === selectedCoach ? 3 : 2;  // Thicker stroke for selected coach
        })
        .style("filter", d => {
            if ((d.type === 'coach' && d.name === selectedCoach) ||
                (d.type === 'team' && (d.name === selectedTeam || d.name === secondSelectedTeam))) {
                return "url(#glow)";
            }
            return "none";
        });

    // Update circles with transitions
    node.selectAll("circle")
        .transition()
        .duration(750)  // 750ms transition
        .attr("r", getNodeRadius)
        .attr("fill", d => {
            if (d.type === 'coach') {
                return d.name === selectedCoach ? '#FFD700' : getNodeColor(d);
            }
            const colors = getTeamColors(d.name);
            return colors.primary;
        })
        .attr("stroke", d => {
            if (d.type === 'coach') {
                return d.name === selectedCoach ? '#2196F3' : '#fff';
            }
            const colors = getTeamColors(d.name);
            return colors.secondary;
        })
        .attr("stroke-width", d => {
            if (d.type === 'team') return 4;
            return d.name === selectedCoach ? 3 : 2;
        })
        .style("filter", d => {
            if ((d.type === 'coach' && d.name === selectedCoach) ||
                (d.type === 'team' && (d.name === selectedTeam || d.name === secondSelectedTeam))) {
                return "url(#glow)";
            }
            return "none";
        });

    // Add 'C' label to selected coach
    node.filter(d => d.type === 'coach' && d.name === selectedCoach)
        .append("text")
        .text("C")
        .attr("text-anchor", "middle")
        .attr("dy", "0.35em")  // Vertically center the text
        .attr("fill", "#000")
        .attr("font-weight", "bold")
        .attr("font-size", "12px");

    // Add labels to nodes
    const labels = node.append("text")
        .text(d => d.name)
        .attr("x", 0)
        .attr("y", d => getNodeRadius(d) + 15)
        .attr("text-anchor", "middle")
        .attr("fill", d => {
            if (d.type === 'coach' && d.name === selectedCoach) {
                return '#E91E63';  // Red text for selected coach
            }
            return "#333";
        })
        .style("font-size", "12px")
        .style("font-weight", d => {
            if (d.type === 'coach' && d.name === selectedCoach) {
                return 'bold';  // Bold text for selected coach
            }
            return 'normal';
        })
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
        const newWidth = d3.select('#networkContainer').node().getBoundingClientRect().width;
        svg.attr("width", newWidth);
        simulation.force("center", d3.forceCenter(newWidth / 2, height / 2));
        simulation.alpha(0.3).restart();
    });

    return simulation;
}

// Update visualization based on selection
function updateVisualization(newSelectedCoach, newSelectedTeam, newSecondSelectedTeam) {
    // Get the current distance value, default to 2 if not set
    const maxDistance = parseInt(document.getElementById('distanceSlider')?.value || '2');
    let filteredData;

    // Update the selected states
    selectedCoach = newSelectedCoach;
    selectedTeam = newSelectedTeam;
    secondSelectedTeam = newSecondSelectedTeam;

    if (selectedCoach) {
        filteredData = filterDataByCoach(selectedCoach, maxDistance);
    } else if (selectedTeam) {
        if (secondSelectedTeam) {
            filteredData = filterTeamToTeam(selectedTeam, secondSelectedTeam);
        } else {
            filteredData = filterDataByTeam(selectedTeam, maxDistance);
        }
    } else {
        filteredData = processCoachingData();
    }

    // Get set of team names in the filtered data
    const networkedTeams = new Set(
        filteredData.nodes
            .filter(n => n.type === 'team')
            .map(n => n.name)
    );

    // Clear existing network visualization only
    d3.select('#networkContainer').selectAll("*").remove();

    // Draw new visualization
    drawNetwork(filteredData);

    // Update map selection with both teams and networked teams
    if (window.updateMapSelection) {
        window.updateMapSelection(selectedTeam, secondSelectedTeam, networkedTeams);
    }
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
                const color = node.type === 'team' ? getTeamColors(node.name).primary : getPositionColor(node.position);
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
    const currentYear = new Date().getFullYear();
    const oldestYear = d3.min(data.links, d => d.yearEnd);

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
        const length = path.nodes.length - 1; // Number of steps between teams
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
            path.nodes.forEach((node, i) => {
                if (i > 0) {
                    const prevNode = path.nodes[i - 1];
                    const link = path.links[i - 1];

                    const opacity = link.yearEnd >= currentYear ? 1.0 :
                        0.1 + (0.9 * Math.pow((link.yearEnd - oldestYear) / (currentYear - oldestYear), 3));

                    let dashStyle = '';
                    if (link.yearEnd < currentYear) {
                        const dashLength = (link.yearEnd - oldestYear) * 2;
                        dashStyle = `background: repeating-linear-gradient(90deg, currentColor 0, currentColor ${dashLength}px, transparent ${dashLength}px, transparent ${dashLength + 3}px)`;
                    }

                    html += `<span style="margin: 0 5px; opacity: ${opacity};">→</span>`;
                }

                if (node.type === 'team') {
                    const teamColors = getTeamColors(node.name);
                    html += `<span style="color: ${teamColors.primary}; font-weight: bold;">${node.name}</span>`;
                } else {
                    const link = path.links[i - 1];
                    const opacity = link.yearEnd >= currentYear ? 1.0 :
                        0.1 + (0.9 * Math.pow((link.yearEnd - oldestYear) / (currentYear - oldestYear), 3));

                    html += `
                        <span style="color: #333;">${node.name}</span>
                        <span style="color: #666; font-size: 0.9em; opacity: ${opacity};">
                            (${link.type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())} 
                            ${link.years})
                        </span>
                    `;
                }
            });
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
    const startYearInput = document.getElementById('startYear');
    const endYearInput = document.getElementById('endYear');
    const { nodes } = processCoachingData();

    // Initialize year inputs
    startYearInput.addEventListener('change', (e) => {
        selectedStartYear = e.target.value ? parseInt(e.target.value) : null;
        const selectedCoach = coachSelect.value;
        const selectedTeam = teamSelect.value;
        const secondTeam = secondTeamSelect.value;
        updateVisualization(selectedCoach, selectedTeam, secondTeam);
    });

    endYearInput.addEventListener('change', (e) => {
        selectedEndYear = e.target.value ? parseInt(e.target.value) : null;
        const selectedCoach = coachSelect.value;
        const selectedTeam = teamSelect.value;
        const secondTeam = secondTeamSelect.value;
        updateVisualization(selectedCoach, selectedTeam, secondTeam);
    });

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
            updateVisualization(selectedCoach, null, null);
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
                updateVisualization(null, selectedTeam, secondTeam);
                updateTeamComparisonDetails(selectedTeam, secondTeam, filteredData);
            } else {
                updateVisualization(null, selectedTeam, null);
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
            updateVisualization(null, selectedTeam, secondTeam);
            updateTeamComparisonDetails(selectedTeam, secondTeam, filteredData);
        } else if (selectedTeam) {
            updateVisualization(null, selectedTeam, null);
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
                updateVisualization(selectedCoach, selectedTeam, secondTeam);
            }
        });
    }
}

// Create a small US map with team locations
function createUSMap() {
    const mapWidth = 600;
    const mapHeight = 550;
    const projection = d3.geoAlbersUsa()
        .scale(650)
        .translate([mapWidth / 2, mapHeight / 2]);

    const path = d3.geoPath().projection(projection);

    // Create SVG for the map
    const mapSvg = d3.select('#mapContainer')
        .append('svg')
        .attr('width', mapWidth)
        .attr('height', mapHeight);

    // Create groups in specific order for layering
    const mapGroup = mapSvg.append('g').attr('class', 'map-layer');
    const dotsGroup = mapSvg.append('g').attr('class', 'dots-layer');
    const arcGroup = mapSvg.append('g').attr('class', 'arc-layer');
    const selectedDotsGroup = mapSvg.append('g').attr('class', 'selected-dots-layer');
    const cityRadius = 5;
    const selectedCityRadius = 8;
    const hoverRadius = 10;
    const bridgeCityRadius = 7;
    const arcWidth = 3;
    const arcOpacity = 1;
    const dotOpacity = 1;
    const dotStrokeWidth = 1;
    const dotStroke = '#fff';
    // Add US map background
    d3.json('https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json').then(function (us) {
        mapGroup.selectAll('path')
            .data(topojson.feature(us, us.objects.states).features)
            .join('path')
            .attr('d', path)
            .attr('fill', '#eee')
            .attr('stroke', '#ccc')
            .attr('stroke-width', 0.5);

        // Add team locations
        const teamDots = dotsGroup.selectAll('circle')
            .data(Object.entries(team_locations))
            .join('circle')
            .attr('cx', d => projection([d[1].lng, d[1].lat])[0])
            .attr('cy', d => projection([d[1].lng, d[1].lat])[1])
            .attr('r', cityRadius)
            .attr('fill', d => getTeamColors(d[0]).primary)
            .attr('stroke', dotStroke)
            .attr('stroke-width', dotStrokeWidth)
            .attr('class', d => `team-dot ${d[0].replace(/\s+/g, '-')}`)
            .style('opacity', dotOpacity)
            .on('click', (event, d) => {
                const teamName = d[0];
                const teamSelect = document.getElementById('teamSelect');
                const secondTeamSelect = document.getElementById('secondTeamSelect');
                const coachSelect = document.getElementById('coachSelect');
                coachSelect.value = '';

                if (event.shiftKey) {
                    // Shift-click: select as second team
                    if (teamSelect.value && teamSelect.value !== teamName) {
                        secondTeamSelect.value = teamName;
                        updateVisualization(null, teamSelect.value, teamName);
                        const filteredData = filterTeamToTeam(teamSelect.value, teamName);
                        updateTeamComparisonDetails(teamSelect.value, teamName, filteredData);
                    }
                } else {
                    // Regular click: select as primary team
                    teamSelect.value = teamName;
                    secondTeamSelect.value = '';
                    updateVisualization(null, teamName, null);
                    updateTeamDetails(teamName);
                }
            })
            .on('mouseover', (event, d) => {
                const currentRadius = parseFloat(d3.select(event.currentTarget).attr('r'));
                d3.select(event.currentTarget)
                    .transition()
                    .duration(200)
                    .attr('r', hoverRadius);

                // Add tooltip
                const tooltip = mapSvg.append('text')
                    .attr('class', 'map-tooltip')
                    .attr('x', projection([d[1].lng, d[1].lat])[0])
                    .attr('y', projection([d[1].lng, d[1].lat])[1] - 10)
                    .attr('text-anchor', 'middle')
                    .attr('fill', '#333')
                    .style('font-size', '10px')
                    .text(d[0]);
            })
            .on('mouseout', (event, d) => {
                const baseRadius = getMapDotRadius(d[0], selectedTeam, secondSelectedTeam);
                d3.select(event.currentTarget)
                    .transition()
                    .duration(200)
                    .attr('r', d[0] === selectedTeam || d[0] === secondSelectedTeam ? selectedCityRadius : cityRadius);
                mapSvg.selectAll('.map-tooltip').remove();
            });

        // Function to get map dot radius based on team status
        function getMapDotRadius(teamName, selectedTeam, secondSelectedTeam, networkedTeams) {
            if (teamName === selectedTeam || teamName === secondSelectedTeam) return selectedCityRadius;
            if (networkedTeams && networkedTeams.has(teamName)) return bridgeCityRadius;
            return cityRadius;
        }

        // Function to draw arc between two cities
        function drawConnectionArc(team1, team2) {
            arcGroup.selectAll('*').remove();

            if (!team1 || !team2) return;

            const loc1 = team_locations[team1];
            const loc2 = team_locations[team2];

            if (!loc1 || !loc2) return;

            const point1 = projection([loc1.lng, loc1.lat]);
            const point2 = projection([loc2.lng, loc2.lat]);

            if (!point1 || !point2) return;

            // Calculate midpoint and add some curve
            const dx = point2[0] - point1[0];
            const dy = point2[1] - point1[1];
            const dr = Math.sqrt(dx * dx + dy * dy);

            // Calculate control point for quadratic curve
            const midX = (point1[0] + point2[0]) / 2;
            const midY = (point1[1] + point2[1]) / 2;
            const curvature = 0.3;
            const controlX = midX - dy * curvature;
            const controlY = midY + dx * curvature;

            // Create the arc path
            const arcPath = `M${point1[0]},${point1[1]} Q${controlX},${controlY} ${point2[0]},${point2[1]}`;

            // Draw the arc
            arcGroup.append('path')
                .attr('d', arcPath)
                .attr('fill', 'none')
                .attr('stroke', getTeamColors(team1).primary)
                .attr('stroke-width', arcWidth)
                .attr('marker-end', 'url(#arrowhead)')
                .attr('marker-start', 'url(#arrowhead)')
                .attr('opacity', arcOpacity);
        }

        // Update map when selection changes
        function updateMapSelection(teamName, secondTeamName, networkedTeams) {
            // Update all dots based on their status
            teamDots
                .attr('r', d => getMapDotRadius(d[0], teamName, secondTeamName, networkedTeams))
                .style('opacity', d => {
                    if (d[0] === teamName || d[0] === secondTeamName) return 1;
                    if (networkedTeams && networkedTeams.has(d[0])) return 0.8;
                    return 0.4;
                })
                .attr('stroke-width', d => {
                    if (d[0] === teamName || d[0] === secondTeamName) return 2;
                    if (networkedTeams && networkedTeams.has(d[0])) return 1.5;
                    return 1;
                });

            // Draw connection arc if both teams are selected
            if (teamName && secondTeamName) {
                drawConnectionArc(teamName, secondTeamName);
            } else {
                arcGroup.selectAll('*').remove();
            }
        }

        // Export updateMapSelection function
        window.updateMapSelection = updateMapSelection;
    });
}

// Modify the initialization to create the map
document.addEventListener('DOMContentLoaded', () => {
    initializeFilters();
    drawNetwork();
    createUSMap();
});

// Expose updateYearFilter to window object
window.updateYearFilter = updateYearFilter;

// Add these near the top of the file with other state variables
let selectedTeam = null;
let secondSelectedTeam = null;
let selectedCoach = null;
let selectedStartYear = null;
let selectedEndYear = null;

// Utility functions
function getNodeRadius(d) {
    const baseRadius = d.type === 'team' ? 25 : 15;
    if (d.type === 'team' && (d.name === selectedTeam || d.name === secondSelectedTeam)) {
        return 40;
    }
    if (d.type === 'coach' && d.name === selectedCoach) {
        return baseRadius * 1.5;
    }
    return baseRadius;
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
            years: conn.years,
            yearStart: conn.yearStart,
            yearEnd: conn.yearEnd
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
                <div class="coach-history-item" style="margin-top: 5px; cursor: pointer;" 
                     onclick="updateYearFilter(${pos.yearStart}, ${pos.yearEnd})">
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

// Add year filter functionality
function updateYearFilter(start, end) {
    const startYearInput = document.getElementById('startYear');
    const endYearInput = document.getElementById('endYear');

    startYearInput.value = start;
    endYearInput.value = end;

    selectedStartYear = start;
    selectedEndYear = end;

    // Re-render visualization with new year filter
    const selectedCoach = document.getElementById('coachSelect').value;
    const selectedTeam = document.getElementById('teamSelect').value;
    const secondTeam = document.getElementById('secondTeamSelect').value;

    updateVisualization(selectedCoach, selectedTeam, secondTeam);
} 