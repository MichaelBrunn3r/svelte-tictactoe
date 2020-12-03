<script>
	export let state;
	export let winner;

	$: isWinnerSquare = winner && winner === state;
</script>

<style>
	.square {
		border: solid 1px gray;
		height: 125px;
		width: 125px;
		flex: 1;
		text-align: center;
		line-height: 125px;
		cursor: pointer;
		font-size: 60px;
	}

	.winner-square {
		color: blue;
		font-size: 100px;
	}
</style>

<div on:click class="square" class:winner-square={isWinnerSquare}>{state}</div>