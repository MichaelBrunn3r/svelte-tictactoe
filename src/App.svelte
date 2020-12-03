<script>
	import Square from './Square.svelte';
	import gameStore from './game-store.js';
	import requests from './requests.js';

	let numPlayers = 0;
	let currentPlayer = "X";
	let board = ["", "", "", "", "", "", "", "", ""];
	let winner;
	let errorMsg;

	gameStore.subscribe(data => {
		if(!data) {
			return;
		}

		winner = data.winner;
		currentPlayer = data.nextPlayer;
		board = data.board;
		numPlayers = data.numberOfPeeps;
	});

	async function takeSquare(square_id) {
		if(winner || !gameStore.isConnected) return;
		errorMsg = await requests.nextMove(square_id);
	}
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

	.errorMessage {
		color: red;
		font-size: 20px;
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
		<Square {winner} state={board[0]} on:click={() => takeSquare(0)}/>
		<Square {winner} state={board[1]} on:click={() => takeSquare(1)}/>
		<Square {winner} state={board[2]} on:click={() => takeSquare(2)}/>
	</div>
	<div class="row">
		<Square {winner} state={board[3]} on:click={() => takeSquare(3)}/>
		<Square {winner} state={board[4]} on:click={() => takeSquare(4)}/>
		<Square {winner} state={board[5]} on:click={() => takeSquare(5)}/>
	</div>
	<div class="row">
		<Square {winner} state={board[6]} on:click={() => takeSquare(6)}/>
		<Square {winner} state={board[7]} on:click={() => takeSquare(7)}/>
		<Square {winner} state={board[8]} on:click={() => takeSquare(8)}/>
	</div>

	{#if winner}
		<button>New Game</button>
	{/if}

	{#if errorMsg}
		<p class="errorMessage">{errorMsg}</p>
	{/if}
</main>