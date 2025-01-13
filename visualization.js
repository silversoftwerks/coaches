// Process the coaching data to create nodes and links for visualization
function processCoachingData(selectedCoach = null, maxDistance = 3) {
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

    // Process all teams and their coaching staffs
    Object.entries(team_coach_history).forEach(([teamName, teamData]) => {
        // Add team node
        const teamNode = addNode(teamName, 'team');

        // Process head coaches
        teamData.head_coaches.forEach(coach => {
            const coachNode = addNode(coach.name, 'coach', teamName, 'Head Coach');
            links.push({
                source: coachNode.id,
                target: teamNode.id,
                type: 'head_coach',
                years: coach.years
            });
        });

        // Process coordinators
        teamData.coordinators.forEach(coord => {
            const coordNode = addNode(coord.name, 'coach', teamName, coord.position);
            links.push({
                source: coordNode.id,
                target: teamNode.id,
                type: coord.position.toLowerCase().includes('offensive') ? 'offensive' :
                    coord.position.toLowerCase().includes('defensive') ? 'defensive' : 'special_teams',
                years: coord.years
            });
        });
    });

    // If a coach is selected, filter nodes and links based on distance
    if (selectedCoach && maxDistance > 0) {
        const selectedNode = Array.from(nodeMap.values()).find(n => n.name === selectedCoach);
        if (selectedNode) {
            const connectedNodes = findNodesWithinDistance(selectedNode, maxDistance, nodes, links);
            const filteredNodes = nodes.filter(n => connectedNodes.has(n.id));
            const filteredLinks = links.filter(l =>
                connectedNodes.has(l.source) && connectedNodes.has(l.target));
            return { nodes: filteredNodes, links: filteredLinks };
        }
    }

    return { nodes, links };
}

// Find nodes within a certain distance of the start node
function findNodesWithinDistance(startNode, maxDistance, nodes, links) {
    const distances = new Map();
    const connectedNodes = new Set();
    const queue = [{ node: startNode, distance: 0 }];

    distances.set(startNode.id, 0);
    connectedNodes.add(startNode.id);

    while (queue.length > 0) {
        const { node, distance } = queue.shift();

        if (distance >= maxDistance) continue;

        // Find all connected links
        links.forEach(link => {
            const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
            const targetId = typeof link.target === 'object' ? link.target.id : link.target;

            if (sourceId === node.id || targetId === node.id) {
                const connectedId = sourceId === node.id ? targetId : sourceId;
                if (!distances.has(connectedId)) {
                    distances.set(connectedId, distance + 1);
                    connectedNodes.add(connectedId);
                    const connectedNode = nodes.find(n => n.id === connectedId);
                    if (connectedNode) {
                        queue.push({ node: connectedNode, distance: distance + 1 });
                    }
                }
            }
        });
    }

    return connectedNodes;
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

    // Create links
    const link = g.append("g")
        .selectAll("line")
        .data(links)
        .join("line")
        .attr("stroke", getLinkColor)
        .attr("stroke-width", getLinkWidth)
        .attr("stroke-opacity", 0.6);

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
        .attr("fill", getNodeColor)
        .attr("stroke", "#fff")
        .attr("stroke-width", 2);

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
        link
            .attr("x1", d => d.source.x)
            .attr("y1", d => d.source.y)
            .attr("x2", d => d.target.x)
            .attr("y2", d => d.target.y);

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
    const maxDistance = parseInt(document.getElementById('distanceSlider').value);
    let filteredData;

    if (selectedCoach) {
        filteredData = filterDataByCoach(selectedCoach, maxDistance);
    } else if (selectedTeam) {
        filteredData = filterDataByTeam(selectedTeam);
    } else {
        filteredData = processCoachingData();
    }

    drawNetwork(filteredData);
}

function filterDataByCoach(coachName, maxDistance) {
    const allData = processCoachingData();
    const startNode = allData.nodes.find(n => n.name === coachName);

    if (!startNode) return allData;

    const nodesWithinDistance = findNodesWithinDistance(startNode, maxDistance, allData.nodes, allData.links);
    const nodeIds = new Set(nodesWithinDistance.map(n => n.id));

    return {
        nodes: nodesWithinDistance,
        links: allData.links.filter(l =>
            nodeIds.has(l.source.id || l.source) &&
            nodeIds.has(l.target.id || l.target)
        )
    };
}

function filterDataByTeam(teamName) {
    const allData = processCoachingData();
    const teamNode = allData.nodes.find(n => n.name === teamName);

    if (!teamNode) return allData;

    // Get all coaches directly connected to this team
    const connectedNodeIds = new Set([teamNode.id]);
    allData.links.forEach(link => {
        const sourceId = link.source.id || link.source;
        const targetId = link.target.id || link.target;

        if (sourceId === teamNode.id) connectedNodeIds.add(targetId);
        if (targetId === teamNode.id) connectedNodeIds.add(sourceId);
    });

    return {
        nodes: allData.nodes.filter(n => connectedNodeIds.has(n.id)),
        links: allData.links.filter(l =>
            connectedNodeIds.has(l.source.id || l.source) &&
            connectedNodeIds.has(l.target.id || l.target)
        )
    };
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

function getNodeColor(d) {
    return d.type === 'team' ? '#4CAF50' : '#2196F3';
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