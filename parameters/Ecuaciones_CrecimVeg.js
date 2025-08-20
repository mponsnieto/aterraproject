function read_Ecuaciones_CrecimVeg(){

/*Ecuaciones_CrecimVeg = 
	`coefs,Muy_alta,Alta,Moderada,Media,Baja,Muy_baja
	x0,98.02924837,98.49918301,98.95866013,99.36584967,100.796732,101.3477124
	x1,1.327456427,1.005722108,0.694045694,0.423169648,-0.639887628,-1.255324504
	x2,-0.027492432,-0.02725731,-0.025925353,-0.024077743,-0.012147919,-0.00270055
	x3,9.13886E-05,0.000110985,0.000121213,0.000124538,9.80163E-05,6.02798E-05
`;*/
	const Ecuaciones_CrecimVeg = {
	  x0: {
	    Muy_alta: 98.02924837,
	    Alta: 98.49918301,
	    Moderada: 98.95866013,
	    Media: 99.36584967,
	    Baja: 100.796732,
	    Muy_baja: 101.3477124
	  },
	  x1: {
	    Muy_alta: 1.327456427,
	    Alta: 1.005722108,
	    Moderada: 0.694045694,
	    Media: 0.423169648,
	    Baja: -0.639887628,
	    Muy_baja: -1.255324504
	  },
	  x2: {
	    Muy_alta: -0.027492432,
	    Alta: -0.02725731,
	    Moderada: -0.025925353,
	    Media: -0.024077743,
	    Baja: -0.012147919,
	    Muy_baja: -0.00270055
	  },
	  x3: {
	    Muy_alta: 9.13886e-05,
	    Alta: 0.000110985,
	    Moderada: 0.000121213,
	    Media: 0.000124538,
	    Baja: 9.80163e-05,
	    Muy_baja: 6.02798e-05
	  }
	};
return Ecuaciones_CrecimVeg;
}