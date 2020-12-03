<script>
	import Square from './Square.svelte';

	let numOtherPlayers = 0;
	let currentPlayer = "X";
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
	<h2>Number of other people playing: {numOtherPlayers}</h2>
	<h2>Player {currentPlayer}</h2>

	<div class="row">
		<Square state={"O"}/>
		<Square state={"O"}/>
		<Square state={"O"}/>
	</div>
	<div class="row">
		<Square state={"O"}/>
		<Square state={"O"}/>
		<Square state={"O"}/>
	</div>
	<div class="row">
		<Square state={"O"}/>
		<Square state={"O"}/>
		<Square state={"O"}/>
	</div>

	<button>New Game</button>
</main>