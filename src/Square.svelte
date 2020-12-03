<script>
	export let state;
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
	}
</style>

<div class="square">{state}</div>