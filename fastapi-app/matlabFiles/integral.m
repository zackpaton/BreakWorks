function result = div(a, b, expression, var)
%This function takes the intgral of a variable over the bounds a and b.

    syms(var);                           
    func = str2sym(expression);                   
    result = double(int(func, sym(var), a, b));

end