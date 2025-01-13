# NFL Coaching Network Visualization

An interactive visualization of NFL coaching connections and histories, showing relationships between teams and coaches across the league.

## Features

- Interactive force-directed graph visualization
- Filter by coach or team
- Adjust connection distance with slider
- Color-coded relationships between coaches and teams
- Detailed coaching history panel
- Responsive design for all screen sizes

## Live Demo

Visit the live visualization at: `https://[your-github-username].github.io/nfl-coaching-network/`

## Setup for Local Development

1. Clone the repository:
```bash
git clone https://github.com/[your-github-username]/nfl-coaching-network.git
cd nfl-coaching-network
```

2. Start a local server:
```bash
python -m http.server 8000
```
Or use any other local server of your choice.

3. Open `http://localhost:8000` in your browser

## Hosting on GitHub Pages

1. Create a new repository on GitHub
2. Push your code to the repository:
```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/[your-github-username]/nfl-coaching-network.git
git push -u origin main
```

3. Go to your repository settings on GitHub
4. Scroll down to the "GitHub Pages" section
5. Select the main branch as the source
6. Your site will be published at `https://[your-github-username].github.io/nfl-coaching-network/`

## Data Structure

The visualization uses two main data files:

- `data/team_coach_history.js`: Contains historical coaching data for all NFL teams
- `visualization.js`: Handles the D3.js visualization logic

## Technologies Used

- D3.js for visualization
- HTML5/CSS3 for layout and styling
- Vanilla JavaScript for interactions 