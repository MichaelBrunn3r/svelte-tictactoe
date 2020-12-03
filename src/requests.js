const nextMove = async (square_id) => {
	try {
		const response = await fetch(`${process.env.apiUrl}/next-turn/${square_id}`);
		const message = await response.json();

		return message.errorMessage;
	} catch (e) {
		console.log(e);
		return 'Error connecting to the server';
	}
}

const newGame = async () => {
	try {
		await fetch(`${process.env.apiUrl}/reset`);
	} catch (e) {
		console.log(e);
		return 'Error connecting to the server';
	}
}

export default {
	nextMove,
	newGame
}