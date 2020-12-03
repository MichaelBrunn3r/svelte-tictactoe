<script>
	import Square from './Square.svelte';
	import gameStore from './game-store.js';

	let numPlayers = 0;
	let currentPlayer = "X";
	let board = ["", "", "", "", "", "", "", "", ""];
	let winner;

	gameStore.subscribe(data => {
		if(!data) {
			return;
		}

		winner = data.winner;
		currentPlayer = data.nextPlayer;
		board = data.board;
		numPlayers = data.numberOfPeeps;
	})
</script>

<style>
	main {
		width: 475px;
		margin: 0 auto;
		height: 1000px;
	}

	.row {
		display: flex;
	}

	button {
		width: 100%;
		margin-top: 20px;
		border-radius: 0;
		font-size: 30px;
		cursor: pointer;
	}

	button:hover {
		outline: none;
	}
</style>

<main>
	<h1>Tic Tac Toe</h1>
	<h2># people playing: {numPlayers}</h2>

	{#if winner === 'TIE'}
		<h2>Tie Game!!!</h2>
	{:else if winner}
		<h2>Player {winner} won!!!</h2>
	{:else}
		<h2>Player {currentPlayer}</h2>
	{/if}

	<div class="row">
		<Square state={board[0]}/>
		<Square state={board[1]}/>
		<Square state={board[2]}/>
	</div>
	<div class="row">
		<Square state={board[3]}/>
		<Square state={board[4]}/>
		<Square state={board[5]}/>
	</div>
	<div class="row">
		<Square state={board[6]}/>
		<Square state={board[7]}/>
		<Square state={board[8]}/>
	</div>

	{#if winner}
		<button>New Game</button>
	{/if}
</main>