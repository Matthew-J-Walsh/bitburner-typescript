/**
 * Our basic strategy here is simple:
 * We cheat off the start playing two moves randomly until we are out of cheats.
 * We allow ourselves to cheat if above some % failure chance if we aren't on a winning streak.
 * Finally,
 * We steal the code and play the same strategy as the Illuminati.
 *
 * On small boards this should have a decent winrate (>50% against everyone), but we can do one better:
 * We then can simulate opponents moves for a couple of moves (20-50 depending on how long it takes),
 * and then use the score of the board at that time to determine if it was a good move. We only use this
 * when our Illumniati strategy returns null (so we would just randomly move) and only on our actual move.
 *
 * As for who to target? Unless we are bladeburner (where we just spam tetradas or w/e), we spam Daedalus
 * until we get red pill, then we spam world deamon unless we are faction rep grinding, then we randomly
 * choose between them
 */
